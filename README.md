## Obsidian Code

<div align="center"><img src="overlay/apps/mobile/assets/obsidiancode/icon.png" alt="ObsidianCode logo" width="128" /></div>

## about

Obsidian doesn't have telemetry; neither should your open-source
control plane's Android companion app.

ObsidianCode is a fork of T3 code with reduced permissions, telemetry, and third-party connections removed. The only connections it makes are to tailscale. tailscale is added to the app itself so you don't have to worry about running tailscale as the Android app taking up your VPN slot. 

ObsidianCode also reduced the app size of T3Code by around four because it's only ARM64 while the released APK for T3 Code is all four architectures of Android bundled together, which is what degoogled users would be forced to use. If you installed it from the Play Store, you'd get the minimal size.

## Bullet points

- removes all third-party connections and telemetry
- removes unnecessary permissions
- cuts the app size by ~75%
- adds Tailscale support into the app, so you don't lose your only VPN slot running Tailscale on Android, and CloudFlare doesn't see your traffic.
- replaces Google-based push notifications with local ones, so you can wreck your battery life privately
