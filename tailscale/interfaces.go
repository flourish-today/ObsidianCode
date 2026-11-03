package main

import (
	"net"
	"net/netip"
	"strconv"
	"strings"
	"sync"

	"tailscale.com/net/netmon"
)

var (
	ifMu   sync.Mutex
	ifList []netmon.Interface
)

// setInterfaces takes one interface per line: name, index, MTU, flags (u up, l loopback,
// p point-to-point, m multicast, b broadcast) and space-separated addresses (ip/prefix),
// separated by tabs.
func setInterfaces(text string) {
	var list []netmon.Interface
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) < 5 || fields[0] == "" {
			continue
		}
		index, _ := strconv.Atoi(fields[1])
		mtu, _ := strconv.Atoi(fields[2])
		var flags net.Flags
		for _, f := range fields[3] {
			switch f {
			case 'u':
				flags |= net.FlagUp | net.FlagRunning
			case 'l':
				flags |= net.FlagLoopback
			case 'p':
				flags |= net.FlagPointToPoint
			case 'm':
				flags |= net.FlagMulticast
			case 'b':
				flags |= net.FlagBroadcast
			}
		}
		addrs := []net.Addr{}
		for _, a := range strings.Fields(fields[4]) {
			prefix, err := netip.ParsePrefix(a)
			if err != nil {
				continue
			}
			addrs = append(addrs, &net.IPNet{
				IP:   prefix.Addr().AsSlice(),
				Mask: net.CIDRMask(prefix.Bits(), prefix.Addr().BitLen()),
			})
		}
		list = append(list, netmon.Interface{
			Interface: &net.Interface{Index: index, MTU: mtu, Name: fields[0], Flags: flags},
			AltAddrs:  addrs,
		})
	}
	ifMu.Lock()
	ifList = list
	ifMu.Unlock()
}

func getInterfaces() ([]netmon.Interface, error) {
	ifMu.Lock()
	defer ifMu.Unlock()
	return append([]netmon.Interface(nil), ifList...), nil
}
