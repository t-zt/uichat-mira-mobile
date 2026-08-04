const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Keep release bundling stable on Windows when transforming large ESM dependencies.
  maxWorkers: 1,
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
