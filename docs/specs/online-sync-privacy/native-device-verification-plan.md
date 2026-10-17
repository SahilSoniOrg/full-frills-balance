# Verify encrypted backup and recovery on native devices

Status: partially complete. Host prerequisites, Android normal/E2E verification APK builds and packaged normal-bundle exclusion checks passed. Physical-device execution has not started.

## Objective

Close the remaining Android/iOS build, native vault, real-file-picker and process-interruption gates for local encrypted backup/recovery. Browser persistence tests and the shared C++ host tests are supporting evidence, not substitutes for native execution.

Work one platform at a time: start with Android on a compatible connected host, establish the procedure, then repeat on iOS using macOS/Xcode and a signed physical-device build. Retain separate pass/fail results for each platform. Emulator/simulator passes do not close physical-device gates.

## Starting evidence and gaps

- Shared C++/WASM crypto, fixed-archive interoperability, financial preparation, restore receipts and browser interruption/retry scenarios have passing evidence.
- The interruption work found and fixed premature launch completion and web IndexedDB publication persistence. Native SQLite, Device vaults, OS lifecycle and file-provider behavior still need independent checks.
- Earlier runs lacked Android Java tooling and iOS build tooling; the ARM64 Linux host could export native JavaScript but could not execute the installed x86-64 Hermes compiler. Inspect current hosts/toolchains rather than assuming these blockers remain or treating JavaScript export as a compiled application.
- `.detoxrc.js` provides physical-device configurations when `DETOX_ANDROID_DEVICE_ID` or `DETOX_IOS_DEVICE_UDID` is configured. iOS building also needs the configured development team/signing setup. Use actual discovered devices; do not invent selectors or reuse stale IDs.
- `e2e/specs/backup/encryption-entrypoints.e2e.ts` now targets the current Encrypted backup journey, including the onboarding entry, disabled restore action and unfinished enrollment after restart. Typechecking passes; execution on a native device is still pending.

## Local preparation record (2026-10-17)

The [repeatable host runbook](./native-host-verification-runbook.md) records all code changes, installed tools, local wrappers, build/inspection commands, encountered failures and retained evidence.

- Shared host crypto and production Android/iOS Hermes bytecode checks passed as recorded in the [host follow-up](./restore-interruption-verification-plan.md#arm64-host-toolchain-follow-up-2026-10-17). Those suites were not rerun during this preparation pass.
- Installed Java 21, Android command-line tools, API 36/build-tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. The ARM64 Linux host runs the SDK's x86-64 tools through QEMU with a separate x86 runtime. Clang, CMake, AAPT2 and ADB execute; ADB currently reports no connected devices.
- Added a `verification` Android build type inheriting Release settings, with application ID `in.sahilsoni.fullfrillsbalance.verification`. Expo regeneration preserves it. This separates test resets from the production, development and preview app IDs; it does not establish that a connected device is disposable.
- `bash scripts/build-android-verification.sh e2e` builds the app and its instrumentation; `normal` disables the E2E bundle capability. Both modes require an explicit `DETOX_ANDROID_ARCH`, disable both Sentry uploads using literal `true`, and honor the local Hermes override for Gradle. Successful builds are copied into separate `artifacts/native-verification/android/e2e/` and `normal/` folders. The bundle task tracks the E2E flag as an input so switching modes regenerates the bundle. Neither build mode installs or resets an app.
- Physical-device Detox configuration: `android.device.verification`, available only with a supplied `DETOX_ANDROID_DEVICE_ID`. Run only `e2e/specs/backup/encryption-entrypoints.e2e.ts` first after discovering and isolating the actual device. Do not substitute the existing production-ID `android.device.release` configuration for disposable testing.
- Focused validation: the two verification-build configuration tests and `typecheck:e2e` passed. Both normal and E2E-capable arm64-v8a app APKs, plus E2E instrumentation, built successfully; this ABI was selected for a build artifact, not inferred from an attached device. The normal build reused native outputs and passed in 3m 53s. Logs are under ignored `artifacts/native-host-verification-2026-10-17/`.
- The build has compiled and linked `libFFBKeyCrypto.so` for Android arm64-v8a using the real NDK/OpenSSL dependency. Its ELF architecture and artifact hash are recorded. Gradle additionally installed NDK 27.0.12077973 for the crypto module's existing default; the app uses 27.1.12297006. This is compile/link evidence only; no Android crypto operation has executed on a device.
- The first full-app attempt exposed the crypto module ignoring `reactNativeArchitectures` and starting an unwanted armeabi-v7a build after arm64. That attempt was stopped intentionally, retaining its log and compiled arm64 outputs. The module now applies the consuming app's ABI selection, and the verification helper runs a Gradle regression assertion against the effective crypto ABI filter before compilation. The focused Gradle configuration check passed in 16 seconds; the arm64-only build has resumed using the cache.
- The resumed build also exposed WatermelonDB JSI ignoring the requested ABI. Its arm64 output was retained, and the verification init script now configures that third-party dependency's ABI filter and asserts both dependencies' effective filters. No dependency source files are patched.
- The combined ABI assertion passed in 6 seconds. Resource packaging then exposed an AAPT2 illegal instruction under QEMU's default CPU model. Both failing dependency images compile with `-cpu max`; a local wrapper around the unchanged Gradle-selected AAPT2 binary supplies that setting. The build helper accepts its path through `FFB_AAPT2_OVERRIDE`. The resumed app/instrumentation build passed in 10m 9s with uploads disabled, preserving the real native libraries and Hermes compilation.
- Packaged-artifact checks passed: all three APK signatures verify; both app manifests use the disposable verification ID and arm64-v8a only; instrumentation targets that exact app ID. Both app APKs contain `libFFBKeyCrypto.so` and Hermes version-98 bytecode. The embedded Expo E2E capability is true for E2E and false for normal. The existing exclusion checker scanned the normal APK's extracted `.hbc` file and found none of its three destructive/test-only markers; the E2E APK contains its expected bootstrap marker. Artifact/bundle/library hashes are in `android-artifacts.json` alongside the logs. These are static checks, not proof of successful installation or runtime behavior.
- Native A–E interruption controls remain unimplemented. Implement them after the real-file native recovery baseline is established; the existing adapter remains web-only.

Source for these builds: `8af2bc205a0682bb4b77ee826a9c6719321584c0` with uncommitted preparation changes in `.detoxrc.js`, the Android build-variant plugin/generated app Gradle file, the crypto module ABI filter, the verification build/init scripts, and the entry-point E2E spec. The dependency lock was unchanged; its hash and host versions are in `android-host.json`.

On this configured host, the completed build commands were:

```sh
source .scratch/native-host-env.sh
DETOX_ANDROID_ARCH=arm64-v8a bash scripts/build-android-verification.sh e2e --max-workers=2 --no-parallel
DETOX_ANDROID_ARCH=arm64-v8a bash scripts/build-android-verification.sh normal --max-workers=2 --no-parallel
```

The `.scratch` setup and APKs are local ignored artifacts. Another host must establish its own compatible SDK/compiler setup; neither command installs or launches an app.

## Simulator entry-point smoke checks (2026-10-17)

Both simulator smoke checks passed on the current Mac. These are runtime evidence for the E2E-capable app entry points only; they do not close physical-device, real-provider, vault or native A–E interruption gates.

| Platform | Environment and build | Result |
| --- | --- | --- |
| iOS Simulator | Xcode 27; iOS 26.4.1 runtime; dedicated `FFB Recovery Source` simulator. Release/E2E app built for simulator with Sentry uploads disabled. Detox targeted simulator UUID `0D7B5548-A3D0-40C1-B446-C1C3FFD30045`. | `e2e/specs/backup/encryption-entrypoints.e2e.ts`: 2 passed. Fresh-install restore entry and unfinished User-enrollment restart passed. Detox could not open the Simulator GUI by app name, but `simctl` launched the app and both tests completed. |
| Android Emulator | API 36, ARM64 `Pixel_2_API_36_Fast`. Release/E2E verification app and instrumentation built with `DETOX_ANDROID_ARCH=arm64-v8a`; Sentry uploads disabled; app ID `in.sahilsoni.fullfrillsbalance.verification`. | `e2e/specs/backup/encryption-entrypoints.e2e.ts`: 2 passed. Fresh-install restore entry and unfinished User-enrollment restart passed. |

The Android run uses a new `android.emu.verification` Detox configuration so it installs the disposable verification app instead of the regular Release app ID. `.detoxrc.js` also accepts `DETOX_IOS_SIMULATOR_UDID` for simulator build destinations when the default named simulator is unavailable. These configuration changes are local to this checkout until committed.

| Plan area | Completed here | Pending |
| --- | --- | --- |
| Stage 1: build/device prerequisites | Host crypto/Hermes, Android toolchain, normal/E2E Release-derived APKs, instrumentation, static exclusion; iOS simulator Release/E2E build; Android emulator verification build | Android/iOS physical-device builds, setup and runtime checks |
| Stage 2: retained-file recovery | Current entry-point selectors prepared and typechecked | Real picker/provider retention, fresh/repeat recovery, restarts and bidirectional platform recovery |
| Stage 3: interruptions/errors | Shared-engine/browser evidence retained | Native authenticated A–E controls, actual process termination/retries and native storage-error checks |
| Stage 4: vault/lock/install loss | Existing static backup-exclusion evidence retained | Device vault/lock/material-loss, reinstall and OS backup/transfer behavior |
| Stage 5: acceptance | Host logs, APK hashes, static checks and outstanding gates recorded | Physical Android and iOS evidence and combined release acceptance |

## Stage 1: establish build and device prerequisites

For each platform record source commit, clean/dirty source state, app variant, bundle/application ID, dependency lock, build commands and toolchain versions. Any test-only changes after the recorded commit must be identified.

| Android | iOS |
| --- | --- |
| Compatible Java/Gradle, Android SDK/NDK, native C++ dependencies and Hermes executable | Compatible macOS/Xcode/SDK, CocoaPods/native dependencies, Hermes executable and signing configuration |
| Authorized dedicated test device visible to ADB, supported ABI and working instrumentation | Trusted/provisioned dedicated iPhone/iPad, device support and a working signed installation |
| Release app and instrumentation build install and launch successfully | Release device build installs/launches; establish whether the existing Detox/device combination is supported and use documented manual/device automation where it is not |

Use existing build scripts/configurations and diagnose actual failures. Do not bypass compiler checks, switch to JavaScript-only exports, or count debug-mode execution as release/Hermes validation. Emulator/simulator builds can identify problems early but must be labeled separately.

Build two kinds of artifacts: an authenticated E2E-capable Release build for deterministic injection/observation, and a normal Release build for genuine picker/vault/lock workflows and harness-exclusion checks. Record platform-appropriate app/JS evidence that the normal artifact excludes test hooks. Run Hermes compilation on a compatible host, not only the existing `--no-bytecode` fallback.

Keep automated Sentry upload disabled for these disposable builds using the existing literal `true` flags. No store submission, backend provisioning, external deletion or signing/account reconfiguration is part of this plan.

## Stage 2: establish the real file and recovery baseline

Use dedicated test app IDs/devices with synthetic data only. Prepare a dataset with six balanced journals, transaction legs, accounts, metadata and audit history; record expected IDs, public identity/key fingerprints and representative financial values.

1. Launch an established synthetic Workplace and enroll User/Workplace encryption through Settings → Data → Encrypted backup.
2. Save each recovery credential through the actual OS picker/share flow, then reopen the saved file to confirm enrollment. Test cancellation and returning from the picker without silently marking enrollment complete.
3. Export the encrypted ZIP to an external user-controlled location, then verify it can be picked and read independently of app cache storage. Retain the User credential separately. A share sheet opening is not proof the file was retained.
4. Restore into a genuinely fresh target installation/second device using those retained files and the normal onboarding entry point. Transfer files through supported user file handling, never by copying a Device vault or silently seeding recovered state.
5. Verify the same User UUID/public fingerprint, the expected Workplace key, a fresh target Device key/ID, manifest receipt, original financial IDs/audits, journal balance and rebuilt balances. Visit Activity and Settings, then restart again and verify completion persists.
6. On the verified target, repeat restore using existing Device access where supported, without requiring a recovery credential, and confirm no duplicate records.

Exercise a local on-device file location and at least one available document provider where practical; record which was actually tested. Note OS/security-scoped URI lifetime, picker permissions, temporary-file cleanup and cancellation outcomes. A test-only injected file path does not close this gate.

Run the baseline on Android and iOS individually. Then add Android → iOS and iOS → Android archive/credential recovery, using retained files and real target pickers. Keep the fixed pre-refactor archive as a compatibility case. Describe any required shared-version constraint rather than silently changing the archive.

## Stage 3: terminate at durable recovery boundaries

Adapt the named boundaries from `restore-interruption-verification-plan.md`. The existing verification adapter is web-only; it must not be claimed to cover native. Prefer narrow authenticated E2E wrappers around actual native/application owners with explicit reached acknowledgements. Add no hooks to normal release builds and expose no secret material.

| Boundary | State before process termination | Required retry result |
| --- | --- | --- |
| A: User/Device recovered | Pending ID and recovered Device access exist; no financial rows/receipt | Same recovered identity/Device reused; one complete financial publication |
| B: financial publication complete | SQLite rows and receipt committed; Workplace keys/session incomplete | Receipt recognized; original books preserved; key installation completes |
| C: before setup-session save | Published books and Workplace keys exist; pending ID retained | Same Device/receipt reused; session persists; pending ID clears |
| D: before pending-ID removal | Matching session exists; pending ID stale | Existing Device access works; stale checkpoint clears without another Device |
| E: before launch completion | Session saved and pending ID cleared; Device setup/activation incomplete | Normal restore entry remains reachable and completion survives another restart |

For each A–E: await the boundary acknowledgement, terminate the real app process without completing the suspended operation, relaunch preserving the same app data/vault, reselect files as required, retry, and verify persisted state and a second restart. Do not use uninstall/clear-data, seeded replacement state, or graceful cancellation as a substitute for process termination.

On Android, distinguish force-stop/process termination from backgrounding or swiping recents. On iOS, distinguish actual process termination from background suspension. Record the mechanism and verify a new process launches. These tests do not prove power-loss durability.

Add one-shot session-write and pending-removal error cases through real store boundaries, keeping crypto and SQLite publication real. Confirm the error is surfaced, retry remains possible, and no success/navigation is reported before required finalization. Disarm injected faults before retry. Also retain the existing different-manifest/primary-ID collision checks after partial progress.

## Stage 4: native vault, lock and installation-loss behavior

- **App lock/background:** start an operation, background/lock the device and return. Verify the established app-lock policy is enforced, stale credential references are unusable, no stale UI action navigates, and recovery resumes without replacing keys. Do not introduce per-operation biometric prompts that the current policy does not require.
- **OS vault accessibility:** test while locked and after unlocking/restarting. Storage denial must fail closed; it is not evidence of a new identity. Test interrupted recovery after lock separately from successful authenticated access.
- **Lost Device key with retained ciphertext:** use a supported test-only loss mechanism on disposable storage, then restore from external recovery files. Established identity pins must prevent silently creating a replacement User root. Verify missing, inaccessible and corrupt state are treated distinctly where supported.
- **Android uninstall/reinstall:** retain files outside the app first; verify app-scoped Device access is gone after uninstall. Check native backup/transfer exclusion configuration and record whether an actual OS backup/transfer was exercised; static XML inspection alone does not prove migration behavior.
- **iOS uninstall/reinstall:** account for Keychain entries that may survive uninstall. App files missing with a surviving key must not authorize silent identity adoption or replacement. Use an independently verified clean target when proving fresh-device recovery; do not assume uninstall removed the vault.
- **Fresh-device transfer:** recovery creates fresh Device access while preserving the User and Workplace identity. A different User recovery file, a Workplace credential substituted for User recovery, damaged ZIP and tampered manifest must be rejected without financial publication/overwrite.

Uninstall, clear-data and key-loss actions apply only to designated disposable test installations after external file retention is verified. When execution cannot establish that isolation, leave the destructive case pending rather than act on personal installations. Do not read or export raw private keys to prove these outcomes.

## Stage 5: evidence and release decision

For every case retain platform, device model/OS, app build/commit, normal versus E2E artifact, file-provider/location, fault/termination mechanism, reached count, observations before/after restart and final result. Record only public identifiers/fingerprints, receipt, source-record IDs/counts, representative synthetic values and launch/lock status. Keep secrets and per-run files out of logs/version control; save videos/traces under ignored artifact directories.

Use explicit outcomes: passed, failed with reproduction, or not run with the missing prerequisite. A mocked failure is not a native OS storage-failure proof. A successful automated selector test is not real file-picker evidence. Full disclosure of these limits is part of acceptance.

Acceptance requires, on **both physical Android and physical iOS**:

- Compiled, installable Release/Hermes artifacts and normal-build harness exclusion.
- Actual saved/reopened credential and ZIP files; fresh-install/device recovery and repeat restore.
- A–E process-termination retries and storage-error cases preserving identity, receipt, primary books and usability across a second restart.
- Lock/vault/material-loss behavior with no silent root replacement.
- Bidirectional Android/iOS recovery and retained pre-refactor archive compatibility.

Record partial progress per platform without closing the combined native release gate. Carry actual OS backup/transfer, inaccessible provider, unavailable device/host or power-loss limitations forward explicitly. Update `preparation.md` and the verification documents to match the observed evidence.

Fix only demonstrated defects in their existing owners, add a regression test and rerun affected cases before the full native/browser regression set. No online sync, new crypto format, database migration, general harness framework or unrelated cleanup is included.
