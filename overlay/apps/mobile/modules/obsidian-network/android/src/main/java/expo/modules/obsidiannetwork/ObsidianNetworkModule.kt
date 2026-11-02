package expo.modules.obsidiannetwork

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Stage 2 adds the Tailscale settings here.
class ObsidianNetworkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ObsidianNetwork")
  }
}
