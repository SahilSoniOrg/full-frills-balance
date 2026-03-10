const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const nativeNodePolyfills = {
  buffer: path.resolve(__dirname, 'node_modules/@craftzdog/react-native-buffer'),
  crypto: path.resolve(__dirname, 'node_modules/react-native-quick-crypto'),
  events: path.resolve(__dirname, 'node_modules/events'),
  stream: path.resolve(__dirname, 'node_modules/readable-stream'),
  util: path.resolve(__dirname, 'node_modules/util'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web' && nativeNodePolyfills[moduleName]) {
    return context.resolveRequest(
      context,
      nativeNodePolyfills[moduleName],
      platform
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
