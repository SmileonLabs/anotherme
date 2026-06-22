const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (process.env.EXPO_WEB_EXPORT === "1") {
  config.maxWorkers = 1;
}

const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer/expo"),
};

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== "svg"),
  sourceExts: [...resolver.sourceExts, "svg"],
};

module.exports = config;
