/** @type {import('detox').DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'jest.detox.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/FullFrillsBalance.app',
      build:
        "xcodebuild -workspace ios/FullFrillsBalance.xcworkspace -scheme FullFrillsBalance -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build -destination 'platform=iOS Simulator,name=iPhone 17' ARCHS=arm64 EXCLUDED_ARCHS=x86_64",
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: process.env.DETOX_IOS_DEVICE || 'iPhone 17',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
  },
  artifacts: {
    rootDir: './artifacts/detox',
    plugins: {
      video: {
        enabled: process.env.DETOX_RECORD_VIDEO === '1',
        keepOnlyFailedTestsArtifacts: false,
      },
      screenshot: {
        enabled: true,
        keepOnlyFailedTestsArtifacts: true,
      },
    },
  },
};
