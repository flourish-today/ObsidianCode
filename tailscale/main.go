// Package main is ObsidianCode's Tailscale node, built as libobsidiantailscale.so and called from
// Kotlin (TailscaleNative.kt) through jni.go. It joins the tailnet in userspace (tsnet: no VPN
// permission, no system-wide routes) and runs a proxy on 127.0.0.1 that reaches tailnet
// addresses only. ConnectionAllowlist.kt sends the app's tailnet connections to that proxy.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"tailscale.com/envknob"
	"tailscale.com/logtail"
	"tailscale.com/tsnet"
)

func main() {}

func init() {
	// Never upload logs to Tailscale. The build also leaves the uploader out (ts_omit_logtail).
	envknob.SetNoLogsNoSupport()
	logtail.Disable()
}

type node struct {
	srv   *tsnet.Server
	ln    net.Listener
	proxy *http.Server
}

var (
	mu  sync.Mutex
	cur *node
)

type result struct {
	Port  int    `json:"port,omitempty"`
	Error string `json:"error,omitempty"`
}

type status struct {
	State   string   `json:"state"`
	AuthURL string   `json:"authUrl,omitempty"`
	IPs     []string `json:"ips,omitempty"`
	DNSName string   `json:"dnsName,omitempty"`
	Port    int      `json:"port,omitempty"`
	Error   string   `json:"error,omitempty"`
}

func toJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func discard(string, ...any) {}

// start joins the tailnet with the state in dir (and authKey, if this is the first login) and
// returns the proxy's port. Login carries on in the background; status reports it.
func start(dir, authKey, hostname string) string {
	mu.Lock()
	defer mu.Unlock()
	if cur != nil {
		return toJSON(result{Port: cur.ln.Addr().(*net.TCPAddr).Port})
	}
	// Android sets no home, cache or temp folder for an app, and Tailscale needs one for its
	// local log bookkeeping (nothing is uploaded), so they point inside the app's own storage.
	cache, tmp := filepath.Join(dir, "cache"), filepath.Join(dir, "tmp")
	for _, d := range []string{dir, cache, tmp} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return toJSON(result{Error: err.Error()})
		}
	}
	os.Setenv("XDG_CACHE_HOME", cache)
	os.Setenv("TMPDIR", tmp)
	if os.Getenv("HOME") == "" {
		os.Setenv("HOME", dir)
	}
	srv := &tsnet.Server{
		Dir:      dir,
		Hostname: hostname,
		AuthKey:  authKey,
		UserLogf: discard,
		Logf:     discard,
	}
	if err := srv.Start(); err != nil {
		srv.Close()
		return toJSON(result{Error: err.Error()})
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		srv.Close()
		return toJSON(result{Error: err.Error()})
	}
	proxy := &http.Server{Handler: newProxy(srv), ReadHeaderTimeout: 30 * time.Second}
	go proxy.Serve(ln)
	cur = &node{srv: srv, ln: ln, proxy: proxy}
	return toJSON(result{Port: ln.Addr().(*net.TCPAddr).Port})
}

func getStatus() string {
	mu.Lock()
	n := cur
	mu.Unlock()
	if n == nil {
		return toJSON(status{State: "Stopped"})
	}
	port := n.ln.Addr().(*net.TCPAddr).Port
	lc, err := n.srv.LocalClient()
	if err != nil {
		return toJSON(status{State: "Starting", Port: port, Error: err.Error()})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	st, err := lc.StatusWithoutPeers(ctx)
	if err != nil {
		return toJSON(status{State: "Starting", Port: port, Error: err.Error()})
	}
	out := status{State: st.BackendState, AuthURL: st.AuthURL, Port: port}
	for _, ip := range st.TailscaleIPs {
		out.IPs = append(out.IPs, ip.String())
	}
	if st.Self != nil {
		out.DNSName = st.Self.DNSName
	}
	if len(st.Health) > 0 && (st.BackendState == "Starting" || st.BackendState == "NoState") {
		out.Error = st.Health[0]
	}
	return toJSON(out)
}

func stopLocked() {
	if cur == nil {
		return
	}
	cur.proxy.Close()
	cur.srv.Close()
	cur = nil
}

func stop() string {
	mu.Lock()
	defer mu.Unlock()
	stopLocked()
	return toJSON(result{})
}

// logout removes this phone from the tailnet and stops. Kotlin then deletes the state directory.
func logout() string {
	mu.Lock()
	defer mu.Unlock()
	if cur == nil {
		return toJSON(result{})
	}
	var errs []error
	if lc, err := cur.srv.LocalClient(); err != nil {
		errs = append(errs, err)
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := lc.Logout(ctx); err != nil {
			errs = append(errs, fmt.Errorf("logout: %w", err))
		}
	}
	stopLocked()
	if err := errors.Join(errs...); err != nil {
		return toJSON(result{Error: err.Error()})
	}
	return toJSON(result{})
}
