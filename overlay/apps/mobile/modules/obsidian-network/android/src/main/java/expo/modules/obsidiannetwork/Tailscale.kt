package expo.modules.obsidiannetwork

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.util.Log
import java.io.File
import java.net.NetworkInterface
import java.util.concurrent.Executors
import org.json.JSONObject

// Tailscale inside the app. Once logged in, it starts with the app; ConnectionAllowlist then sends
// connections to Tailscale addresses through the Go library's local proxy.
object Tailscale {
  private const val TAG = "ObsidianTailscale"
  private const val PREFS = "obsidiancode_tailscale"
  private const val KEY_ENABLED = "enabled"
  private const val HOSTNAME = "obsidiancode"

  // 0 while Tailscale is off.
  @Volatile var proxyPort = 0
    private set

  private val worker = Executors.newSingleThreadExecutor()
  private lateinit var appContext: Context

  private fun prefs() = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun stateDir() = File(appContext.filesDir, "tailscale")

  fun init(context: Context) {
    appContext = context.applicationContext
    if (prefs().getBoolean(KEY_ENABLED, false)) {
      worker.execute { startNow("") }
    }
  }

  fun start(authKey: String): String = worker.submit<String> { startNow(authKey.trim()) }.get()

  fun status(): String =
    worker.submit<String> {
      if (!loaded) JSONObject().put("state", "Stopped").toString() else TailscaleNative.status()
    }.get()

  fun stop(): String =
    worker.submit<String> {
      prefs().edit().putBoolean(KEY_ENABLED, false).apply()
      setPort(0)
      if (loaded) TailscaleNative.stop() else "{}"
    }.get()

  fun logout(): String =
    worker.submit<String> {
      prefs().edit().putBoolean(KEY_ENABLED, false).apply()
      setPort(0)
      // Logging out needs the node running; if it's off, only this phone's copy is removed.
      val result = if (loaded) TailscaleNative.logout() else "{}"
      stateDir().deleteRecursively()
      result
    }.get()

  // Whether the Go library has been loaded (only on the worker thread).
  private var loaded = false

  // Android doesn't let the Go library list network interfaces itself, so they're read here and
  // handed over before starting and whenever the network changes.
  private fun interfacesText(): String =
    try {
      NetworkInterface.getNetworkInterfaces()?.toList().orEmpty().joinToString("\n") { ni ->
        val flags = buildString {
          if (ni.isUp) append('u')
          if (ni.isLoopback) append('l')
          if (ni.isPointToPoint) append('p')
          if (ni.supportsMulticast()) append('m')
        }
        val addresses = ni.interfaceAddresses.joinToString(" ") {
          "${it.address.hostAddress?.substringBefore('%')}/${it.networkPrefixLength}"
        }
        listOf(ni.name, ni.index, ni.mtu, flags, addresses).joinToString("\t")
      }
    } catch (error: Exception) {
      Log.w(TAG, "Couldn't list network interfaces", error)
      ""
    }

  private fun pushInterfaces() {
    if (loaded) TailscaleNative.setInterfaces(interfacesText())
  }

  private var watchingNetwork = false

  private fun watchNetwork() {
    if (watchingNetwork) return
    watchingNetwork = true
    val manager = appContext.getSystemService(ConnectivityManager::class.java) ?: return
    try {
      manager.registerDefaultNetworkCallback(
        object : ConnectivityManager.NetworkCallback() {
          override fun onAvailable(network: Network) = update()

          override fun onLost(network: Network) = update()

          override fun onLinkPropertiesChanged(network: Network, properties: LinkProperties) = update()

          private fun update() {
            worker.execute { pushInterfaces() }
          }
        },
      )
    } catch (error: Exception) {
      Log.w(TAG, "Can't watch for network changes", error)
    }
  }

  private fun startNow(authKey: String): String {
    val result = try {
      TailscaleNative.setInterfaces(interfacesText())
      loaded = true
      watchNetwork()
      TailscaleNative.start(stateDir().absolutePath, authKey, HOSTNAME)
    } catch (error: Throwable) {
      Log.e(TAG, "Tailscale didn't start", error)
      return JSONObject().put("error", error.message ?: error.toString()).toString()
    }
    val port = JSONObject(result).optInt("port", 0)
    if (port > 0) {
      prefs().edit().putBoolean(KEY_ENABLED, true).apply()
      setPort(port)
    }
    return result
  }

  private fun setPort(port: Int) {
    proxyPort = port
    ConnectionAllowlist.applyWebViewProxy(port)
  }
}
