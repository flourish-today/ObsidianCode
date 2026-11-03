package main

import "testing"

func TestSetInterfaces(t *testing.T) {
	setInterfaces("wlan0\t30\t1500\tumb\t192.168.1.20/24 fe80::1/64\nlo\t1\t65536\tul\t127.0.0.1/8\n\nbad line")
	list, _ := getInterfaces()
	if len(list) != 2 {
		t.Fatalf("got %d interfaces", len(list))
	}
	w := list[0]
	if w.Name != "wlan0" || w.Index != 30 || w.MTU != 1500 || !w.IsUp() || w.IsLoopback() {
		t.Fatalf("wlan0 parsed wrong: %+v", w.Interface)
	}
	addrs, _ := w.Addrs()
	if len(addrs) != 2 || addrs[0].String() != "192.168.1.20/24" || addrs[1].String() != "fe80::1/64" {
		t.Fatalf("addresses: %v", addrs)
	}
	if !list[1].IsLoopback() {
		t.Fatal("lo should be loopback")
	}
}
