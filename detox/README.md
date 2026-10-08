# Detox (native iOS & Android)

End-to-end tests run on iOS/Android simulators and emulators by default, with opt-in attached-device configurations for release validation.

Detox runs locally. iOS Detox also runs in GitHub Actions (`.github/workflows/detox.yml`).

## iOS (default): Release + embedded bundle

Detox uses a **Release** simulator build with `export:embed` — **no Expo dev client, no Metro**. Debug builds set `SKIP_BUNDLING=1` and require the dev launcher; we avoid that for E2E.

Configuration: `ios.sim.release` in `.detoxrc.js`.

### Physical iOS device

Connect and trust a signed device, then set its UDID and Apple development team:

```bash
export DETOX_IOS_DEVICE_UDID="<device-udid>"
export DETOX_IOS_DEVELOPMENT_TEAM="<apple-team-id>"
bunx detox build --configuration ios.device.release
bun run e2e:test:ios:device
```

The physical-device lane uses the same critical specs as the simulator lane. It is intentionally opt-in because signing and device availability are host-specific.

## Prerequisites

- Xcode + iOS Simulator (**iPhone 17** by default)
- [applesimutils](https://github.com/wix/AppleSimulatorUtils)

## One-time / after native changes

```bash
npx expo prebuild --platform ios
cd ios && pod install && cd ..
npx detox clean-framework-cache && npx detox build-framework-cache
cp .env.e2e.example .env.local
EXPO_PUBLIC_E2E=1 bun run e2e:build:ios
```

Android Detox native setup (`expo-detox-config-plugin`, `DetoxTest.java`, `.so` packaging) is applied by **config plugins** in `app.config.ts` — safe to re-run `npx expo prebuild --platform android` after native changes. Do not hand-edit `android/build.gradle` for packaging; use `plugins/withAndroidNativeLibPackaging.js`.

## Run tests locally

```bash
bun run e2e:test:ios
```

Override simulator type:

```bash
DETOX_IOS_DEVICE="iPhone 17" bun run e2e:test:ios
```

Full clean build + run:

```bash
bun run e2e:clean:ios
```

## Dev client (optional, not used in CI)

`ios.sim.debug` still exists for manual dev-client debugging; it requires Metro on **8081** and the dev launcher flow.

## Android (local Detox)

Prerequisites: Android SDK, a running or bootable Android 16 AVD (default name `Pixel_2_API_36_Fast`).

- macOS: ARM64 system image (Apple Silicon). Native ABIs stay `arm64-v8a,armeabi-v7a` from `android/gradle.properties`.
- Linux x86_64 (cloud agents): the same AVD name, with `system-images;android-36;google_apis;x86_64`. `.detoxrc.js` adds `-PreactNativeArchitectures=x86_64` and boots the emulator headless (`swiftshader_indirect`, `-accel on` when KVM is available).

Uses **release + embedded bundle** (`android.emu.release`) — no Metro, no dev launcher.

```bash
npx expo prebuild --platform android   # regenerates android/ from app.config plugins
cp .env.e2e.example .env.local         # optional: EXPO_PUBLIC_E2E=1
bun run e2e:build:android
bun run e2e:test:android
```

Linux cloud agents install the toolchain once per environment build via `.cursor/environment.json` (`scripts/android-cloud-setup.sh`). On a fresh VM:

```bash
bun run e2e:setup:android
bun run e2e:build:android
bun run e2e:test:android
```

KVM (`/dev/kvm`) is used when the device node is readable. Without it the emulator falls back to software emulation and the suite is much slower. The setup script grants access with `chmod 666 /dev/kvm` when passwordless sudo is available. Gradle on machines under 24GB RAM uses a 2.5GB heap and 1.5GB metaspace in the user `gradle.properties` (the committed project file requests 8GB / 2GB, and R8 runs out of metaspace at 512MB). Release lint is turned off in that user file so it does not run beside minify.

Use an existing AVD:

```bash
DETOX_AVD_NAME="Your_Avd_Name" bun run e2e:test:android
```

### Physical Android device

With a USB-debugging-enabled device visible to `adb`:

```bash
export DETOX_ANDROID_DEVICE_ID="<adb-serial>"
bun run e2e:build:android
bun run e2e:test:android:device
```

The attached-device lane reuses the release APK and the same critical specs as the emulator lane.

## E2E seed profiles

Most specs use **programmatic onboarding** via Detox `launchArgs` (see [the E2E architecture notes](../docs/architecture/MOBILE_E2E.md)). The dedicated `onboarding.e2e.ts` exercises the UI flow.

## Artifacts

Screenshots on failure under `artifacts/detox/`. Video:

```bash
DETOX_RECORD_VIDEO=1 bun run test:detox:video
```
