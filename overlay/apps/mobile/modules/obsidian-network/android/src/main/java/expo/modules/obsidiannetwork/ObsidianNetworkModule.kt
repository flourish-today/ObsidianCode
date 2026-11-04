package expo.modules.obsidiannetwork

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Tailscale controls (JSON responses) and local Android notification functions.
class ObsidianNetworkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ObsidianNetwork")

    AsyncFunction("tailscaleStart") { authKey: String -> Tailscale.start(authKey) }
    AsyncFunction("tailscaleStatus") { Tailscale.status() }
    AsyncFunction("tailscaleStop") { Tailscale.stop() }
    AsyncFunction("tailscaleLogout") { Tailscale.logout() }

    AsyncFunction("localNotificationsEnabled") {
      appContext.reactContext?.let { LocalAgentNotifications.enabled(it) } ?: false
    }
    AsyncFunction("showLocalNotification") {
        path: String, scheme: String, title: String, body: String ->
      appContext.reactContext?.let {
        LocalAgentNotifications.show(it, path, scheme, title, body)
      } ?: false
    }
    AsyncFunction("dismissLocalNotification") { path: String ->
      appContext.reactContext?.let { LocalAgentNotifications.dismiss(it, path) }
    }
  }
}
