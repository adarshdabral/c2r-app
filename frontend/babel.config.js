module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // react-native-worklets/plugin must be listed last (replaces the legacy
    // react-native-reanimated/plugin in Reanimated v4).
    plugins: ["react-native-worklets/plugin"],
  };
};
