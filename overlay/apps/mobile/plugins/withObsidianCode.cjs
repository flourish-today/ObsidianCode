const { withGradleProperties } = require("expo/config-plugins");

// ObsidianCode: native code for arm64 phones only, instead of four processor types.
module.exports = function withObsidianCode(config) {
  return withGradleProperties(config, (nextConfig) => {
    const properties = nextConfig.modResults.filter(
      (item) => !(item.type === "property" && item.key === "reactNativeArchitectures"),
    );
    properties.push({ type: "property", key: "reactNativeArchitectures", value: "arm64-v8a" });
    nextConfig.modResults = properties;
    return nextConfig;
  });
};
