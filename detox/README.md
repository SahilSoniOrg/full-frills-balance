# Detox (native iOS & Android)

End-to-end tests on the **iOS Simulator** or **Android emulator** using a **development client** build. Playwright tests in `e2e/*.test.ts` cover the web export.

## Prerequisites

- Xcode + iOS Simulator (**iPhone 17** by default)
- [applesimutils](https://github.com/wix/AppleSimulatorUtils)
- Metro on port **8081**: `bun start`

## One-time / after native changes

```bash
npx expo prebuild --platform ios
npx detox clean-framework-cache && npx detox build-framework-cache
cp .env.e2e.example .env.local   # optional: EXPO_PUBLIC_E2E=1
bun run e2e:build:ios
```

## Run tests locally

```bash
bun start   # separate terminal
bun run e2e:test:ios
```

Override simulator type:

```bash
DETOX_IOS_DEVICE="iPhone 17" bun run e2e:test:ios
```

If the dev launcher stalls, set `DETOX_METRO_URL` to your LAN IP (e.g. `http://192.168.1.x:8081`).

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

See `scripts/record-onboarding-ios.sh` and `maestro/`.
