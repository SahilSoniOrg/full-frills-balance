# Detox (native iOS & Android)

End-to-end tests on the **iOS Simulator** or **Android emulator**. Playwright tests in `e2e/*.test.ts` cover the web export.

## iOS (default): Release + embedded bundle

Detox uses a **Release** simulator build with `export:embed` — **no Expo dev client, no Metro**. Debug builds set `SKIP_BUNDLING=1` and require the dev launcher; we avoid that for E2E.

Configuration: `ios.sim.release` in `.detoxrc.js`.

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

## Android (local)

Prerequisites: Android SDK, a running or bootable AVD (default name `Pixel_7_API_34`), Metro on **8081**.

```bash
npx expo prebuild --platform android   # after native / @config-plugins/detox changes
cp .env.e2e.example .env.local         # optional: EXPO_PUBLIC_E2E=1
bun run e2e:build:android
bun start                                # separate terminal
bun run e2e:test:android
```

Use an existing AVD:

```bash
DETOX_AVD_NAME="Your_Avd_Name" bun run e2e:test:android
```

`reversePorts` in `.detoxrc.js` forwards Metro to the emulator; on a physical device you may need `adb reverse tcp:8081 tcp:8081` instead of the emulator config.

## Layout (one-mobile style)

```text
e2e/
  specs/           # *.e2e.ts — Detox specs only
  screens/         # testID constants
  actions/         # launch, onboarding, mobile flows
  constants/
  utils/
```

## E2E seed profiles

Most specs use **programmatic onboarding** via Detox `launchArgs` (see [e2e-decisions.md](../docs/testing/e2e-decisions.md)). The dedicated `onboarding.e2e.ts` exercises the UI flow.

## Artifacts

Screenshots on failure under `artifacts/detox/`. Video:

```bash
DETOX_RECORD_VIDEO=1 bun run test:detox:video
```

## Maestro (recording only)

Maestro still uses the **dev client** + Metro. See `scripts/record-onboarding-ios.sh` and `maestro/`.
