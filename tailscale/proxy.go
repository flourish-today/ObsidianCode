package main

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/netip"
	"strings"
	"time"

	"tailscale.com/net/tsaddr"
	"tailscale.com/tsnet"
)

// The proxy takes CONNECT requests (https and wss) and absolute-URL requests (http and ws,
// including WebSocket upgrades). It connects only to Tailscale addresses, and looks names up only
// in the tailnet's own device list, so nothing reaches the internet or the phone's DNS through it.

var errNotTailnet = errors.New("ObsidianCode: only Tailscale addresses can be reached through Tailscale")

type proxy struct {
	srv     *tsnet.Server
	forward *httputil.ReverseProxy
}

func newProxy(srv *tsnet.Server) *proxy {
	p := &proxy{srv: srv}
	p.forward = &httputil.ReverseProxy{
		// Rewrite (instead of Director) adds no X-Forwarded headers. Hop-by-hop headers such as
		// Proxy-Connection are removed by ReverseProxy; WebSocket upgrades are passed through.
		Rewrite: func(r *httputil.ProxyRequest) {
			r.Out.Host = r.In.Host
			r.Out.Header.Del("Proxy-Authorization")
		},
		Transport: &http.Transport{
			Proxy:               nil,
			DialContext:         p.dial,
			MaxIdleConnsPerHost: 4,
			IdleConnTimeout:     90 * time.Second,
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			logf("proxy: %s %s: %v", r.Method, r.URL.Host+r.URL.Path, err)
			http.Error(w, "ObsidianCode proxy: "+err.Error(), http.StatusBadGateway)
		},
	}
	return p
}

func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		p.tunnel(w, r)
		return
	}
	if !r.URL.IsAbs() || (r.URL.Scheme != "http" && r.URL.Scheme != "https") {
		logf("proxy: not a proxy request: %s %s", r.Method, r.URL.Host+r.URL.Path)
		http.Error(w, "ObsidianCode: proxy requests only", http.StatusBadRequest)
		return
	}
	p.forward.ServeHTTP(w, r)
}

func (p *proxy) tunnel(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	target, err := p.dial(ctx, "tcp", r.Host)
	cancel()
	if err != nil {
		logf("proxy: CONNECT %s: %v", r.Host, err)
		http.Error(w, "ObsidianCode proxy: "+err.Error(), http.StatusBadGateway)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		target.Close()
		http.Error(w, "ObsidianCode: can't tunnel", http.StatusInternalServerError)
		return
	}
	client, buf, err := hj.Hijack()
	if err != nil {
		target.Close()
		return
	}
	if _, err := client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		client.Close()
		target.Close()
		return
	}
	go pipe(target, buf.Reader, client)
	pipe(client, target, target)
}

// pipe copies src to dst, then closes closer so the other direction ends too.
func pipe(dst io.Writer, src io.Reader, closer io.Closer) {
	_, _ = io.Copy(dst, src)
	closer.Close()
}

// dial connects to host:port inside the tailnet only.
func (p *proxy) dial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ip, err := p.resolve(ctx, host)
	if err != nil {
		return nil, err
	}
	return p.srv.Dial(ctx, network, net.JoinHostPort(ip.String(), port))
}

func (p *proxy) resolve(ctx context.Context, host string) (netip.Addr, error) {
	host = strings.ToLower(strings.TrimSuffix(strings.Trim(host, "[]"), "."))
	if ip, err := netip.ParseAddr(host); err == nil {
		ip = ip.Unmap()
		if isPeerIP(ip) {
			return ip, nil
		}
		return netip.Addr{}, errNotTailnet
	}
	if !strings.HasSuffix(host, ".ts.net") {
		return netip.Addr{}, errNotTailnet
	}
	lc, err := p.srv.LocalClient()
	if err != nil {
		return netip.Addr{}, err
	}
	st, err := lc.Status(ctx)
	if err != nil {
		return netip.Addr{}, err
	}
	for _, peer := range st.Peer {
		if strings.EqualFold(strings.TrimSuffix(peer.DNSName, "."), host) {
			for _, ip := range peer.TailscaleIPs {
				if ip.Is4() && isPeerIP(ip) {
					return ip, nil
				}
			}
			for _, ip := range peer.TailscaleIPs {
				if isPeerIP(ip) {
					return ip, nil
				}
			}
		}
	}
	return netip.Addr{}, errNotTailnet
}

// isPeerIP: a Tailscale device address, not Tailscale's own built-in service address (100.100.100.100).
func isPeerIP(ip netip.Addr) bool {
	return tsaddr.IsTailscaleIP(ip) && ip != tsaddr.TailscaleServiceIP() && ip != tsaddr.TailscaleServiceIPv6()
}
