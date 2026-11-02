import type { ExpoConfig } from "expo/config";

import upstream from "./app.config.upstream.ts";

// ObsidianCode: upstream's config (renamed to app.config.upstream.ts) without the services
// that connect to third parties. Their native code is left out in prepare.sh.
const REMOVED_PLUGINS = new Set(["@clerk/expo", "expo-camera", "expo-notifications"]);

const BLOCKED_PERMISSIONS = [
  "android.permission.CAMERA",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.POST_PROMOTED_NOTIFICATIONS",
  "com.google.android.c2dm.permission.RECEIVE",
  "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE",
  "com.google.android.gms.permission.AD_ID",
];

type Plugin = NonNullable<ExpoConfig["plugins"]>[number];

function pluginName(plugin: Plugin): string {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

const { owner: _owner, runtimeVersion: _runtimeVersion, ...base } = upstream;

// Keeps only the extra keys the app needs; drops the relay, Clerk, Axiom and EAS settings.
const extra = Object.fromEntries(
  Object.entries(upstream.extra ?? {}).filter(
    ([key]) =>
      !["relay", "clerk", "observability", "eas"].includes(key) &&
      !key.startsWith("EXPO_PUBLIC_CLERK_"),
  ),
);

const config: ExpoConfig = {
  ...base,
  updates: { enabled: false },
  android: {
    ...upstream.android,
    package: "org.getflourish.obsidiancode",
    // The workflow's run number, so each release installs over the last.
    versionCode: Number(process.env.OBSIDIANCODE_VERSION_CODE) || 1,
    blockedPermissions: [...(upstream.android?.blockedPermissions ?? []), ...BLOCKED_PERMISSIONS],
  },
  plugins: [
    ...(upstream.plugins ?? []).filter((plugin) => !REMOVED_PLUGINS.has(pluginName(plugin))),
    "./plugins/withObsidianCode.cjs",
  ],
  extra,
};

export default config;
