const path = require("node:path");

// ObsidianCode: upstream's Metro config (renamed to metro.config.upstream.js), with the removed
// libraries replaced by do-nothing stand-ins in obsidiancode/stubs.
const STUBS = {
  "@clerk/expo": "clerk-expo.js",
  "@clerk/expo/native-components": "clerk-expo-native-components.js",
  "@clerk/expo/token-cache": "clerk-expo-token-cache.js",
  "expo-application": "expo-application.js",
  "expo-camera": "expo-camera.js",
  "expo-notifications": "expo-notifications.js",
  "expo-observe": "expo-observe.js",
  "expo-updates": "expo-updates.js",
};
const REMOVED = ["@clerk/", "expo-application/", "expo-camera/", "expo-notifications/", "expo-observe/", "expo-updates/"];
const STUB_DIR = path.join(__dirname, "obsidiancode", "stubs");

module.exports = Promise.resolve(require("./metro.config.upstream.js")).then((config) => {
  const upstreamResolveRequest = config.resolver?.resolveRequest;
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        const stub = STUBS[moduleName];
        if (stub) return { type: "sourceFile", filePath: path.join(STUB_DIR, stub) };
        // A new import of a removed library must fail the build, not slip through.
        if (REMOVED.some((prefix) => moduleName.startsWith(prefix))) {
          throw new Error(`ObsidianCode: ${moduleName} is removed and has no stand-in.`);
        }
        return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
      },
    },
  };
});
