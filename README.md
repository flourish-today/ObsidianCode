<div align="center"><img src="overlay/apps/mobile/assets/obsidiancode/icon.png" alt="ObsidianCode logo" width="128" /></div>

Obsidian doesn't have telemetry, neither should your Agent Orchestrator Harness thingy's Android app.

ObsidianCode is a fork of T3 code with reduced permissions, telemetry, and third-party connections removed. tailscale is added to the app itself so you don't have to worry about running tailscale as the Android app taking up your VPN slot. It's also reduced size by around four because it's only ARM64.

This is for personal use but you can use it.

Local agent alerts can be enabled in Settings → Notifications. They notify you when an
agent finishes, fails, or needs your response, using the app's existing connection. They
do not use Firebase or T3 Connect and cannot arrive while Android suspends or closes the app.

Normal builds collect the licenses and notices for ObsidianCode's additions (Tailscale,
its Android Go dependencies, the Go runtime, and AndroidX WebKit). Each release includes
`THIRD-PARTY-NOTICES.txt`, also bundled inside the APK at
`assets/obsidiancode/THIRD-PARTY-NOTICES.txt`. Collection uses the dependency versions
and build tags used for that release. A missing Go module license fails the build;
changes to the direct Android dependency require a license review in `collect-licenses.py`.
