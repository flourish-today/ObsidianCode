package expo.modules.obsidiannetwork

// The Go library built from tailscale/ in the ObsidianCode repo. Every function returns JSON.
internal object TailscaleNative {
  init {
    System.loadLibrary("obsidiantailscale")
  }

  @JvmStatic external fun start(dir: String, authKey: String, hostname: String): String

  @JvmStatic external fun status(): String

  @JvmStatic external fun stop(): String

  @JvmStatic external fun logout(): String

  @JvmStatic external fun setInterfaces(text: String)
}
