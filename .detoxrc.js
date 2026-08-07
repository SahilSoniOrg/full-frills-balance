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
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/FullFrillsBalance.app',
      build:
        "EXPO_PUBLIC_E2E=1 xcodebuild -workspace ios/FullFrillsBalance.xcworkspace -scheme FullFrillsBalance -configuration Release -sdk iphonesimulator -derivedDataPath ios/build -destination 'platform=iOS Simulator,name=iPhone 17' ARCHS=arm64 EXCLUDED_ARCHS=x86_64 CODE_SIGNING_ALLOWED=NO",
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk',
      build:
        'cd android && EXPO_PUBLIC_E2E=1 ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: process.env.DETOX_IOS_DEVICE || 'iPhone 17',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: process.env.DETOX_AVD_NAME || 'Pixel_10_Pro',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
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
