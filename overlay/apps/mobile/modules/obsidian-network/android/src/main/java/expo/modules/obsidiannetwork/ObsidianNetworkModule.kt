package expo.modules.obsidiannetwork

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Used by src/features/connection/TailscaleCard.tsx. Each function returns JSON.
class ObsidianNetworkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ObsidianNetwork")

    AsyncFunction("tailscaleStart") { authKey: String -> Tailscale.start(authKey) }
    AsyncFunction("tailscaleStatus") { Tailscale.status() }
    AsyncFunction("tailscaleStop") { Tailscale.stop() }
    AsyncFunction("tailscaleLogout") { Tailscale.logout() }
  }
}
