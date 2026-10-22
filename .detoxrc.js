/** @type {import('detox').DetoxConfig} */
const os = require('os');

const iosDeviceUdid = process.env.DETOX_IOS_DEVICE_UDID;
const iosSimulatorUdid = process.env.DETOX_IOS_SIMULATOR_UDID;
const androidDeviceId = process.env.DETOX_ANDROID_DEVICE_ID;
const linuxX64 = process.platform === 'linux' && os.arch() === 'x64';

function iosSimulatorBuildDestination() {
  if (iosSimulatorUdid) {
    if (!/^[0-9a-f-]{36}$/i.test(iosSimulatorUdid)) {
      throw new Error('DETOX_IOS_SIMULATOR_UDID must be a simulator UUID');
    }
    return `id=${iosSimulatorUdid}`;
  }
  return 'platform=iOS Simulator,name=iPhone 17';
}

// macOS keeps the ABIs in android/gradle.properties (arm64 emulator / devices).
// Linux cloud agents are x86_64 and need a matching APK or the emulator cannot load .so files.
function androidArchGradleArg() {
  const arch = process.env.DETOX_ANDROID_ARCH || (linuxX64 ? 'x86_64' : '');
  if (!arch) return '';
  if (!/^[A-Za-z0-9_,.-]+$/.test(arch)) {
    throw new Error(`Refusing unsafe DETOX_ANDROID_ARCH value: ${arch}`);
  }
  return ` -PreactNativeArchitectures=${arch}`;
}

module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'jest.detox.config.js',
    },
    jest: {
      setupTimeout: linuxX64 ? 300000 : 120000,
    },
  },
  // Linux cloud agents install the APKs once in scripts/e2e-android.sh.
  // Reinstalling at worker start repeats dex2oat on software emulation.
  ...(linuxX64
    ? {
        behavior: {
          init: {
            reinstallApp: false,
          },
        },
      }
    : {}),
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/FullFrillsBalance.app',
      build: `xcodebuild -workspace ios/FullFrillsBalance.xcworkspace -scheme FullFrillsBalance -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build -destination '${iosSimulatorBuildDestination()}' ARCHS=arm64 EXCLUDED_ARCHS=x86_64`,
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/FullFrillsBalance.app',
      // Give the simulator app a signing identity for native Keychain proof tests.
      // Ad-hoc signing uses no distribution credentials; device signing stays separate.
      build: `SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true EXPO_PUBLIC_E2E=1 xcodebuild -workspace ios/FullFrillsBalance.xcworkspace -scheme FullFrillsBalance -configuration Release -sdk iphonesimulator -derivedDataPath ios/build -destination '${iosSimulatorBuildDestination()}' ARCHS=arm64 EXCLUDED_ARCHS=x86_64 SWIFT_ACTIVE_COMPILATION_CONDITIONS='$(inherited) FFB_KEY_CRYPTO_E2E' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO`,
    },
    'ios.device.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphoneos/FullFrillsBalance.app',
      build:
        "SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true EXPO_PUBLIC_E2E=1 xcodebuild -workspace ios/FullFrillsBalance.xcworkspace -scheme FullFrillsBalance -configuration Release -sdk iphoneos -derivedDataPath ios/build -destination 'id=$DETOX_IOS_DEVICE_UDID' DEVELOPMENT_TEAM=$DETOX_IOS_DEVELOPMENT_TEAM SWIFT_ACTIVE_COMPILATION_CONDITIONS='$(inherited) FFB_KEY_CRYPTO_E2E' CODE_SIGNING_ALLOWED=YES",
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: `cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug${androidArchGradleArg()}`,
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk',
      build: `cd android && SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true EXPO_PUBLIC_E2E=1 ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release${androidArchGradleArg()}`,
    },
    'android.verification': {
      type: 'android.apk',
      binaryPath: 'artifacts/native-verification/android/e2e/app-verification.apk',
      testBinaryPath: 'artifacts/native-verification/android/e2e/app-verification-androidTest.apk',
      build: 'bash scripts/build-android-verification.sh e2e',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: process.env.DETOX_IOS_SIMULATOR_UDID
        ? { id: process.env.DETOX_IOS_SIMULATOR_UDID }
        : {
            type: process.env.DETOX_IOS_DEVICE || 'iPhone 17',
          },
    },
    emulator: {
      type: 'android.emulator',
      // Headless + software GPU is the workable path on a Linux VM. macOS keeps Detox defaults.
      ...(linuxX64
        ? {
            headless: true,
            // Writable so a Detox-launched fallback cannot start a second -read-only emulator
            // beside the one scripts/e2e-android.sh already booted.
            readonly: false,
            // Detox only accepts this enum. scripts/android-env.sh appends `-gpu software`,
            // which the emulator applies last and which avoids the host swiftshader ANR path.
            gpuMode: 'off',
            // Set by scripts/android-env.sh. Default off: -accel-check can pass while vCPU creation hangs.
            bootArgs: process.env.DETOX_EMULATOR_BOOT_ARGS || '-accel off -gpu software',
          }
        : {}),
      device: {
        avdName: process.env.DETOX_AVD_NAME || 'Pixel_2_API_36_Fast',
      },
    },
    ...(iosDeviceUdid
      ? {
          iosDevice: {
            type: 'ios.device',
            device: { id: iosDeviceUdid },
          },
        }
      : {}),
    ...(androidDeviceId
      ? {
          androidDevice: {
            type: 'android.attached',
            device: { adbName: androidDeviceId },
          },
        }
      : {}),
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
    ...(iosDeviceUdid
      ? {
          'ios.device.release': {
            device: 'iosDevice',
            app: 'ios.device.release',
          },
        }
      : {}),
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
    'android.emu.verification': {
      device: 'emulator',
      app: 'android.verification',
    },
    ...(androidDeviceId
      ? {
          'android.device.release': {
            device: 'androidDevice',
            app: 'android.release',
          },
          'android.device.verification': {
            device: 'androidDevice',
            app: 'android.verification',
            // Physical runs install their own disposable APK; they do not use
            // the Linux emulator's preinstalled production-ID snapshot.
            behavior: { init: { reinstallApp: true } },
          },
        }
      : {}),
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
