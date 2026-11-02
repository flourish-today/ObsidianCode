#!/usr/bin/env bash
# Turns an upstream T3 Code checkout into ObsidianCode's mobile app.
# Usage: prepare.sh <upstream checkout>
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
upstream="$1"
mobile="$upstream/apps/mobile"

git -C "$upstream" apply "$here/obsidiancode.patch"

# Our app.config.ts and metro.config.js wrap upstream's, which keep their content under a new name.
mv "$mobile/app.config.ts" "$mobile/app.config.upstream.ts"
mv "$mobile/metro.config.js" "$mobile/metro.config.upstream.js"

# Upstream's Android notification module depends on Firebase messaging.
rm -r "$mobile/modules/t3-agent-notifications"

cp -R "$here/overlay/." "$upstream/"

# Leaves the removed libraries' native code out of the app. Their JavaScript is replaced in metro.config.js.
node -e '
const fs = require("node:fs");
const file = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.expo ??= {};
manifest.expo.autolinking ??= {};
manifest.expo.autolinking.exclude = [
  ...(manifest.expo.autolinking.exclude ?? []),
  "@clerk/expo",
  "@clerk/expo-native-components",
  "expo-app-metrics",
  "expo-application",
  "expo-camera",
  "expo-notifications",
  "expo-observe",
  "expo-updates",
];
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
' "$mobile/package.json"
