package expo.modules.obsidiannetwork

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

  @Volatile private var installed = false

  fun install() {
    if (installed) return
    setDefault(this)
    installed = true
    if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
      val config = ProxyConfig.Builder()
        .addProxyRule("http://127.0.0.1:$CLOSED_PORT")
        .apply { WEBVIEW_ALLOWED.forEach { addBypassRule(it) } }
        .build()
      ProxyController.getInstance().setProxyOverride(config, { it.run() }, {})
    } else {
      Log.w(TAG, "This WebView can't limit its connections.")
    }
  }

  override fun select(uri: URI?): List<Proxy> {
    val host = uri?.host ?: return refused
    return if (isAllowedHost(host)) direct else refused
  }

  override fun connectFailed(uri: URI?, address: SocketAddress?, error: IOException?) {}

  fun isAllowedHost(rawHost: String): Boolean {
    val host = rawHost.trim().removePrefix("[").removeSuffix("]").removeSuffix(".").lowercase()
    if (host == "localhost" || host.endsWith(".ts.net") || host.endsWith(".local")) return true
    // Only literal addresses are parsed, so this never makes a DNS lookup.
    val isLiteral = IPV4_LITERAL.matches(host) || host.contains(':')
    if (!isLiteral) return false
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
