const { getDefaultConfig } = require('@expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.sourceExts = Array.from(new Set([...(config.resolver.sourceExts || []), 'cjs']));

config.symbolicator = {
  customizeFrame: (frame) => {
    if (!frame || !frame.file) return {};
    if (frame.file === '<anonymous>' || frame.file.startsWith('eval')) {
      return { collapse: true };
    }
    return {};
  },
};

module.exports = config;