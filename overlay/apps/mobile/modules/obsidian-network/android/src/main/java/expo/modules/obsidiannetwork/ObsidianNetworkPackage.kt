package expo.modules.obsidiannetwork

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

// Installs the allowlist when the app starts, before React Native creates any network client.
class ObsidianNetworkPackage : Package {
  override fun createApplicationLifecycleListeners(
    context: Context,
  ): List<ApplicationLifecycleListener> =
    listOf(
      object : ApplicationLifecycleListener {
        override fun onCreate(application: Application) {
          ConnectionAllowlist.install()
        }
      },
    )
}
