package main

/*
#include <jni.h>
#include <stdlib.h>

static const char* oc_chars(JNIEnv* env, jstring s) { return (*env)->GetStringUTFChars(env, s, NULL); }
static void oc_release(JNIEnv* env, jstring s, const char* c) { (*env)->ReleaseStringUTFChars(env, s, c); }
static jstring oc_string(JNIEnv* env, const char* c) { return (*env)->NewStringUTF(env, c); }
*/
import "C"

import (
	"fmt"
	"strings"
	"unsafe"
)

// The functions Kotlin's TailscaleNative object calls. Each returns JSON.

func goString(env *C.JNIEnv, s C.jstring) string {
	c := C.oc_chars(env, s)
	defer C.oc_release(env, s, c)
	return C.GoString(c)
}

func javaString(env *C.JNIEnv, s string) C.jstring {
	c := C.CString(asciiJSON(s))
	defer C.free(unsafe.Pointer(c))
	return C.oc_string(env, c)
}

// asciiJSON escapes non-ASCII characters, since JNI's NewStringUTF expects modified UTF-8.
func asciiJSON(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r < 0x80:
			b.WriteRune(r)
		case r < 0x10000:
			fmt.Fprintf(&b, `\u%04x`, r)
		default:
			r -= 0x10000
			fmt.Fprintf(&b, `\u%04x\u%04x`, 0xD800+(r>>10), 0xDC00+(r&0x3FF))
		}
	}
	return b.String()
}

//export Java_expo_modules_obsidiannetwork_TailscaleNative_start
func Java_expo_modules_obsidiannetwork_TailscaleNative_start(env *C.JNIEnv, _ C.jclass, dir, authKey, hostname C.jstring) C.jstring {
	return javaString(env, start(goString(env, dir), goString(env, authKey), goString(env, hostname)))
}

//export Java_expo_modules_obsidiannetwork_TailscaleNative_status
func Java_expo_modules_obsidiannetwork_TailscaleNative_status(env *C.JNIEnv, _ C.jclass) C.jstring {
	return javaString(env, getStatus())
}

//export Java_expo_modules_obsidiannetwork_TailscaleNative_stop
func Java_expo_modules_obsidiannetwork_TailscaleNative_stop(env *C.JNIEnv, _ C.jclass) C.jstring {
	return javaString(env, stop())
}

//export Java_expo_modules_obsidiannetwork_TailscaleNative_logout
func Java_expo_modules_obsidiannetwork_TailscaleNative_logout(env *C.JNIEnv, _ C.jclass) C.jstring {
	return javaString(env, logout())
}
