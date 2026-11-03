//go:build android

package main

/*
#cgo LDFLAGS: -llog
#include <android/log.h>
#include <stdlib.h>
*/
import "C"

import (
	"fmt"
	"unsafe"
)

// logf writes a warning to logcat, tag ObsidianTailscale.
func logf(format string, args ...any) {
	tag := C.CString("ObsidianTailscale")
	msg := C.CString(fmt.Sprintf(format, args...))
	C.__android_log_write(C.ANDROID_LOG_WARN, tag, msg)
	C.free(unsafe.Pointer(tag))
	C.free(unsafe.Pointer(msg))
}
