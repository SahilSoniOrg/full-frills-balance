const os = require('os');
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

config.maxWorkers = os.cpus().length;

// Ensure web-specific extensions are prioritized for web platform
config.resolver.platforms = ['web', ...config.resolver.platforms.filter(p => p !== 'web')];
config.resolver.sourceExts = [...new Set(config.resolver.sourceExts)];

const nativeNodePolyfills = {
  buffer: path.resolve(__dirname, 'node_modules/@craftzdog/react-native-buffer'),
  crypto: path.resolve(__dirname, 'node_modules/react-native-quick-crypto'),
  events: path.resolve(__dirname, 'node_modules/events'),
  stream: path.resolve(__dirname, 'node_modules/readable-stream'),
  util: path.resolve(__dirname, 'node_modules/util'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const currentPlatform = platform || context.platform;

  if (currentPlatform === 'web' && moduleName.includes('turbomodule/NativeNitroModules')) {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'src/mocks/NativeNitroModulesMock.ts'),
      currentPlatform,
    );
  }

  if (currentPlatform === 'web' && moduleName.includes('react-native/Libraries/')) {
    return { type: 'empty' };
  }

  const result = (() => {
    // Fix for "tslib.default is undefined" crash on web
    if (moduleName === 'tslib') {
      return context.resolveRequest(
        context,
        path.resolve(__dirname, 'node_modules/tslib/tslib.es6.js'),
        currentPlatform,
      );
    }

    if (currentPlatform !== 'web' && nativeNodePolyfills[moduleName]) {
      return context.resolveRequest(context, nativeNodePolyfills[moduleName], currentPlatform);
    }

    return context.resolveRequest(context, moduleName, currentPlatform);
  })();

  let resolvedResult = result;
  if (currentPlatform === 'web' && result && result.type === 'sourceFile' && result.filePath) {
    if (result.filePath.includes('.native.')) {
      const nonNativePath = result.filePath.replace('.native.', '.');
      const fs = require('fs');
      if (fs.existsSync(nonNativePath)) {
        resolvedResult = {
          ...result,
          filePath: nonNativePath,
        };
      }
    }
  }

  return resolvedResult;
};

module.exports = config;
