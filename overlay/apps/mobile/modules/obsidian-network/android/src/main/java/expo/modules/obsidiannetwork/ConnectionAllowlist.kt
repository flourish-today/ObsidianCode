package expo.modules.obsidiannetwork

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import java.io.IOException
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.ProxySelector
import java.net.SocketAddress
import java.net.URI

// The app may connect only to this phone, private networks (the home LAN) and Tailscale.
// Anything else is sent to a proxy on a closed local port, so it fails without leaving the phone
// and without a DNS lookup. Covers every client that follows Java's default ProxySelector
// (OkHttp, which React Native, expo-image and expo/fetch use, and HttpURLConnection), plus WebViews.
// While Tailscale (Tailscale.kt) is on, Tailscale addresses go through its local proxy instead.
object ConnectionAllowlist : ProxySelector() {
  private const val TAG = "ObsidianNetwork"

  // Port 9 (discard): apps can't listen below 1024, so nothing on the phone answers.
  private const val CLOSED_PORT = 9
  private val refused = listOf(Proxy(Proxy.Type.HTTP, InetSocketAddress(InetAddress.getLoopbackAddress(), CLOSED_PORT)))
  private val direct = listOf(Proxy.NO_PROXY)

  private val IPV4_LITERAL = Regex("""^\d{1,3}(\.\d{1,3}){3}$""")

  // Chromium bypass-rule format, the same ranges as isAllowedHost.
  private val WEBVIEW_ALLOWED = listOf(
    "localhost",
    "*.ts.net",
    "*.local",
    "127.0.0.0/8",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "169.254.0.0/16",
    "100.64.0.0/10",
    "::1/128",
    "fc00::/7",
    "fe80::/10",
  )

  // While Tailscale is on, WebViews send everything except these to its proxy, which refuses
  // anything that isn't a Tailscale address. fc00::/8 leaves out fd00::/8, where Tailscale's
  // IPv6 addresses are.
  private val WEBVIEW_ALLOWED_WITH_TAILSCALE =
    WEBVIEW_ALLOWED.filter { it != "*.ts.net" && it != "100.64.0.0/10" && it != "fc00::/7" } + "fc00::/8"

  @Volatile private var installed = false

  fun install() {
    if (installed) return
    setDefault(this)
    installed = true
    applyWebViewProxy(Tailscale.proxyPort)
  }

  fun applyWebViewProxy(tailscalePort: Int) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      Handler(Looper.getMainLooper()).post { applyWebViewProxy(tailscalePort) }
      return
    }
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
      Log.w(TAG, "This WebView can't limit its connections.")
      return
    }
    val (port, bypass) =
      if (tailscalePort > 0) tailscalePort to WEBVIEW_ALLOWED_WITH_TAILSCALE else CLOSED_PORT to WEBVIEW_ALLOWED
    val config = ProxyConfig.Builder()
      .addProxyRule("http://127.0.0.1:$port")
      .apply { bypass.forEach { addBypassRule(it) } }
      .build()
    ProxyController.getInstance().setProxyOverride(config, { it.run() }, {})
  }

  override fun select(uri: URI?): List<Proxy> {
    val host = uri?.host ?: return refused
    val tailscalePort = Tailscale.proxyPort
    if (tailscalePort > 0 && isTailscaleHost(host)) {
      return listOf(Proxy(Proxy.Type.HTTP, InetSocketAddress(InetAddress.getLoopbackAddress(), tailscalePort)))
    }
    return if (isAllowedHost(host)) direct else refused
  }

  private fun normalize(rawHost: String) =
    rawHost.trim().removePrefix("[").removeSuffix("]").removeSuffix(".").lowercase()

  private fun isLiteral(host: String) = IPV4_LITERAL.matches(host) || host.contains(':')

  // *.ts.net, 100.64.0.0/10 or fd7a:115c:a1e0::/48.
  fun isTailscaleHost(rawHost: String): Boolean {
    val host = normalize(rawHost)
    if (host.endsWith(".ts.net")) return true
    if (!isLiteral(host)) return false
    val bytes = try {
      InetAddress.getByName(host).address
    } catch (_: Exception) {
      return false
    }
    return when (bytes.size) {
      4 -> bytes[0] == 100.toByte() && (bytes[1].toInt() and 0xC0) == 0x40
      16 -> bytes[0] == 0xfd.toByte() && bytes[1] == 0x7a.toByte() && bytes[2] == 0x11.toByte() &&
        bytes[3] == 0x5c.toByte() && bytes[4] == 0xa1.toByte() && bytes[5] == 0xe0.toByte()
      else -> false
    }
  }

  override fun connectFailed(uri: URI?, address: SocketAddress?, error: IOException?) {}

  fun isAllowedHost(rawHost: String): Boolean {
    val host = normalize(rawHost)
    if (host == "localhost" || host.endsWith(".ts.net") || host.endsWith(".local")) return true
    // Only literal addresses are parsed, so this never makes a DNS lookup.
    if (!isLiteral(host)) return false
    val address = try {
      InetAddress.getByName(host)
    } catch (_: Exception) {
      return false
    }
    if (address.isLoopbackAddress || address.isSiteLocalAddress || address.isLinkLocalAddress) {
      return true
    }
    val bytes = address.address
    return when (address) {
      // 100.64.0.0/10: Tailscale's addresses (shared address space).
      is Inet4Address -> bytes[0] == 100.toByte() && (bytes[1].toInt() and 0xC0) == 0x40
      // fc00::/7: unique local addresses, which Tailscale's IPv6 addresses use.
      is Inet6Address -> (bytes[0].toInt() and 0xFE) == 0xFC
      else -> false
    }
  }
}
