//go:build android

package main

import (
	_ "tailscale.com/feature/androidbin" // Android: DNS and certificates for an app without root.
	"tailscale.com/net/netmon"
)

// Android doesn't let apps list network interfaces and their addresses the Linux way (netlink),
// so Kotlin reads them with Java's NetworkInterface and hands them over (setInterfaces), as
// Tailscale's own Android app does.
func init() {
	netmon.RegisterInterfaceGetter(getInterfaces)
}
