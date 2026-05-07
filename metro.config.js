const os = require('os');
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

config.maxWorkers = os.cpus().length;

// Support .mjs for libraries like framer-motion/moti
if (!config.resolver.sourceExts.includes('mjs')) {
  config.resolver.sourceExts.push('mjs');
}

const nativeNodePolyfills = {
  buffer: path.resolve(__dirname, 'node_modules/@craftzdog/react-native-buffer'),
  crypto: path.resolve(__dirname, 'node_modules/react-native-quick-crypto'),
  events: path.resolve(__dirname, 'node_modules/events'),
  stream: path.resolve(__dirname, 'node_modules/readable-stream'),
  util: path.resolve(__dirname, 'node_modules/util'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix for "tslib.default is undefined" crash on web
  if (moduleName === 'tslib') {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'node_modules/tslib/tslib.es6.js'),
      platform,
    );
  }

  if (platform !== 'web' && nativeNodePolyfills[moduleName]) {
    return context.resolveRequest(context, nativeNodePolyfills[moduleName], platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
