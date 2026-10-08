# Android update recordings

`in-app-update-flow.e2e.ts` exercises the production update coordinator, screens and
unsaved-edit guard with a deterministic store transport. It covers download and
explicit installation, cancellation, store fallback, installation retry and an
unsaved journal amount. `update-gate.e2e.ts` covers the mandatory backup screen and
moving the optional notice into Hub.

The simulated build is 160; the offered build is 161. No store download, package
installation or process restart occurs. The native dialogs explicitly say they are
mocked. These tests do not verify the library's native bridge, Play eligibility or
delivery; those still require signed builds distributed through Play.

## Build and record

Configure JDK 17 and the Android SDK, then build the test-only APKs:

```sh
cd android
SENTRY_DISABLE_AUTO_UPLOAD=true APP_VARIANT=production EXPO_PUBLIC_E2E=1 \
  ./gradlew :app:assembleRelease :app:assembleReleaseAndroidTest \
  -DtestBuildType=release -PreactNativeArchitectures=arm64-v8a
cd ..
```

For the configured Android emulator:

```sh
DETOX_RECORD_VIDEO=1 bunx detox test --configuration android.emu.release \
  e2e/specs/update --runInBand --record-videos all --take-screenshots all \
  --record-logs all --artifacts-location artifacts/detox/update-flow
```

To use an already booted emulator, set `DETOX_ANDROID_DEVICE_ID=emulator-5554` and
select `android.device.release`. Each test saves `test.mp4`, screenshots and logs.
Recording mode adds brief reading pauses. Fixtures reset and seed only the test
app's data, so use a dedicated emulator.

## Fixture controls

`launchWithUpdateGate(mode, { flow, seedProfile })` supplies the harness token and
launch arguments. Modes are `available` and `required`; transport flows are:

| Flow              | Response                                            |
| ----------------- | --------------------------------------------------- |
| `download`        | Prompt, progress, downloaded, explicit installation |
| `cancel`          | Same prompt; the test selects Cancel                |
| `failure`         | Native launch fails and opens a mock store fallback |
| `downloaded`      | Update already downloaded on launch                 |
| `install-failure` | First installation fails; retry succeeds            |

The mock factory requires the build flag, native E2E capability and valid harness
token. Production builds exclude it. Verify that boundary with
`bun run check:production-e2e-bundle`; the exported bundle must also contain none of
the `Mock Play update` or `Mock store fallback` strings.
