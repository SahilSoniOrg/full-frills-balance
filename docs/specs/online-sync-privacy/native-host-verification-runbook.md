# Repeat the native host verification work



Recorded 2026-10-17 on Ubuntu 22.04 ARM64 Linux, in `checkout/`. Run repository commands from that directory. This records completed work and how to repeat it; physical-device acceptance is tracked separately in the [native verification plan](./native-device-verification-plan.md).

## Code changes made

| File | Change and purpose |
| --- | --- |
| `plugins/withAndroidBuildVariants.js`, `android/app/build.gradle` | Added a `verification` build type inheriting Release, with app ID `in.sahilsoni.fullfrillsbalance.verification`. Tracks the E2E flag as a bundle-task input so switching modes regenerates JavaScript. The plugin preserves the configuration during Expo regeneration. |
| `scripts/build-android-verification.sh` | Builds normal or E2E verification APKs for an explicit ABI; E2E also builds instrumentation. Disables Sentry uploads, forwards the local Hermes/AAPT2 overrides, and retains normal/E2E APKs separately. Does not install or launch anything. |
| `scripts/check-android-key-abi.gradle` | Applies the requested ABI to the third-party WatermelonDB JSI project and asserts the effective ABI filters of both WatermelonDB JSI and the crypto module. Skips included React Native/Expo plugin builds. |
| `modules/expo-key-crypto/android/build.gradle` | Makes the crypto module honor the consuming app's `reactNativeArchitectures` property. |
| `.detoxrc.js` | Adds the staged verification APKs and the conditional `android.device.verification` configuration. Device runs use the separate app ID. |
| `e2e/specs/backup/encryption-entrypoints.e2e.ts` | Replaces stale recovery/enrollment selectors with the current Encrypted backup selectors. Preserves disabled-restore and unfinished-enrollment restart assertions. Typechecked; not executed on a device. |
| `scripts/__tests__/android-verification-build.test.mjs` | Two focused tests for variant generation/idempotence and the physical verification Detox configuration. |

Documentation changes record the evidence, this procedure and pending gates. No crypto protocol, database schema, recovery business logic or native A–E fault controls were added. The source changes remain uncommitted in this checkout; preserve them along with this runbook when moving to another host.

## Host setup that was completed

The host initially had Node 22.23.2, Bun 1.3.13 and the project dependencies. The dependency lock was not changed. The source commit was `8af2bc205a0682bb4b77ee826a9c6719321584c0`, plus the uncommitted changes above.

Installed Java 21, `qemu-user`, `qemu-user-binfmt`, and x86 runtime cross packages. The resulting Java version was 21.0.12.1, and QEMU was 6.2.0. On an equivalent Ubuntu host the package setup is:

```sh
sudo apt-get update
sudo apt-get install openjdk-21-jdk-headless qemu-user qemu-user-binfmt \
  libc6-amd64-cross libstdc++6-amd64-cross libgcc-s1-amd64-cross
```

Package patch versions can differ on a later host. This setup is for ARM64 Linux running the SDK's x86-64 tools; a native x86-64 host does not need this emulation layer.

Android SDK root: `$HOME/Android/Sdk`. Installed command-line tools revision 19.0 from `commandlinetools-linux-13114758_latest.zip` into `cmdline-tools/latest`, then installed/accepted the SDK packages below. The downloaded ZIP remains at `$HOME/.cache/ffb-toolchains/android-commandlinetools.zip` on this host.

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-arm64
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
sdkmanager --licenses
sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' \
  'ndk;27.1.12297006' 'cmake;3.22.1'
```

Gradle 9.3.1 is supplied by the repository wrapper. Gradle additionally installed NDK `27.0.12077973` for the crypto module's existing default. Both NDK versions were retained; no NDK alignment change was needed. No emulator/system image was installed.

For dynamically linked x86 SDK tools, copied the cross runtime and extracted an official Ubuntu amd64 zlib package into a separate prefix:

```sh
mkdir -p "$HOME/.local/share/ffb-toolchains/android-x86-runtime"
cp -a /usr/x86_64-linux-gnu/lib /usr/x86_64-linux-gnu/lib64 \
  "$HOME/.local/share/ffb-toolchains/android-x86-runtime/"
dpkg-deb -x "$HOME/.cache/ffb-toolchains/zlib1g-amd64.deb" \
  "$HOME/.local/share/ffb-toolchains/android-x86-runtime"
```

The cached zlib package is `zlib1g` `1:1.2.11.dfsg-2ubuntu9.2`, architecture `amd64`, SHA-256 `9dc17e51a1be2d9ed63b7b84ef0e4e29c5abe6f1bc62cb03e7181483cce8a2f2`. On a fresh host obtain the amd64 package from the Ubuntu archive; the cache is not committed.

Registered x86 execution through `qemu-user-binfmt`. `/proc/sys/fs/binfmt_misc/qemu-x86_64` was enabled, with interpreter `/usr/libexec/qemu-binfmt/x86_64-binfmt-P`. `/etc/qemu-binfmt/x86_64` points to `$HOME/.local/share/ffb-toolchains/android-x86-runtime`; this lets x86 tools spawned by Gradle find their loader/runtime. On a fresh host create that link only after checking any existing entry, and enable the package's x86_64 binfmt registration if it is not enabled. The current symlink is host setup, not repository content.

Clang, SDK CMake, AAPT2 and ADB were exercised. ADB reported no connected devices, including at the end. No app was installed, launched, reset or uninstalled.

## OpenSSL and compiler setup

An HPKE-enabled OpenSSL 3.6.0 installation already existed at `/tmp/pr86-openssl`; it was not built from scratch during this work. Its headers and static libraries were copied to `$HOME/.local/share/ffb-toolchains/openssl-3.6.0`, and copied pkg-config prefixes were corrected. `FFB_OPENSSL_PREFIX` selects it for the host C++ test runner. If neither prefix exists on a future host, install/build an HPKE-enabled OpenSSL first, then point the variable at its installation prefix. Check for `include/openssl/hpke.h`; the system's older OpenSSL headers are insufficient.

To repeat the relocation while the original prefix exists:

```sh
python3 - <<'PY'
import re, shutil
from pathlib import Path
source = Path('/tmp/pr86-openssl')
target = Path.home() / '.local/share/ffb-toolchains/openssl-3.6.0'
assert (source / 'include/openssl/hpke.h').is_file()
for directory in ('include', 'lib'):
    shutil.copytree(source / directory, target / directory, dirs_exist_ok=True)
for pc in (target / 'lib/pkgconfig').glob('*.pc'):
    pc.write_text(re.sub(r'^prefix=.*$', f'prefix={target}', pc.read_text(), flags=re.M))
PY
```

Host OpenSSL is separate from Android's Gradle-resolved OpenSSL prefab dependency (`openssl-static-3.6.2-2`). Do not copy Linux host libraries into an Android APK.

The existing project compiler `hermes-compiler@250829098.0.17` was run through QEMU. It reports HBC version 98; its SHA-256 is `925ddf1bc2f17578e8af5df391c9d84dbd98441540fb43257aac3ef75c54b749`. No compiler package/version was replaced. An attempted source build was abandoned and its partial work cleaned up; it is not needed to repeat this procedure.

The ignored `.scratch/host-hermes/build/bin/hermesc` wrapper runs:

```sh
#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/qemu-x86_64 "/absolute/checkout/node_modules/hermes-compiler/hermesc/linux64-bin/hermesc" "$@"
```

Replace `/absolute/checkout` with the actual checkout and make the wrapper executable. Expo uses `REACT_NATIVE_OVERRIDE_HERMES_DIR`; Gradle needs its separate `react.hermesCommand` setting, which the new build helper supplies through a temporary init script.

AAPT2 initially crashed with an illegal instruction while compiling two dependency PNGs. Both files compiled successfully with QEMU `-cpu max`. The ignored `.scratch/host-aapt2/aapt2` executable wrapper runs:

```sh
#!/usr/bin/env bash
exec /usr/bin/qemu-x86_64 -cpu max \
  -L "$HOME/.local/share/ffb-toolchains/android-x86-runtime" \
  /absolute/path/to/gradle-resolved/aapt2 "$@"
```

Use the unchanged Gradle-resolved `aapt2-8.12.0-13700139-linux/aapt2` binary for this recorded dependency set. Its cache directory hash is machine-specific. After Gradle has downloaded/resolved it, locate it using:

```sh
rg --files --hidden "$HOME/.gradle/caches/9.3.1/transforms" | rg '/aapt2$'
```

Set the wrapper's absolute binary path deliberately if multiple versions exist. The original image failure was reproduced once in isolation, then both failing images were checked with the CPU correction before resuming the full build. Do not clear the native build cache for this error.

The ignored `.scratch/native-host-env.sh` holds these exports, with absolute paths matching the checkout:

```sh
export FFB_OPENSSL_PREFIX="$HOME/.local/share/ffb-toolchains/openssl-3.6.0"
export REACT_NATIVE_OVERRIDE_HERMES_DIR="/absolute/checkout/.scratch/host-hermes"
export QEMU_LD_PREFIX="$HOME/.local/share/ffb-toolchains/android-x86-runtime"
export FFB_AAPT2_OVERRIDE="/absolute/checkout/.scratch/host-aapt2/aapt2"
```

The wrappers, environment file, SDK and toolchain prefixes are local setup. Recreate them on a new checkout; Git does not retain them.

## Repeat only the checks needed

Two focused configuration tests and the E2E typecheck passed:

```sh
node --test scripts/__tests__/android-verification-build.test.mjs
npm run typecheck:e2e
```

The following Gradle dry run evaluated and passed both effective ABI assertions without compiling native code:

```sh
source .scratch/native-host-env.sh
source scripts/android-env.sh
(
  cd android
  SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true \
    EXPO_PUBLIC_E2E=1 APP_VARIANT=production \
    ./gradlew :expo-key-crypto:externalNativeBuildRelease \
      :watermelondb-jsi:externalNativeBuildRelease --dry-run \
      -PreactNativeArchitectures=arm64-v8a -DtestBuildType=verification \
      --init-script ../scripts/check-android-key-abi.gradle --max-workers=2 --no-parallel
)
```

The actual builds were:

```sh
source .scratch/native-host-env.sh
DETOX_ANDROID_ARCH=arm64-v8a bash scripts/build-android-verification.sh e2e --max-workers=2 --no-parallel
DETOX_ANDROID_ARCH=arm64-v8a bash scripts/build-android-verification.sh normal --max-workers=2 --no-parallel
```

Select an ABI explicitly; arm64-v8a was selected for these artifacts, not discovered from a connected device. The helper disables both Sentry uploads using literal `true`, not `1`. It stages outputs in `artifacts/native-verification/android/e2e/` and `normal/`. The E2E directory also contains `app-verification-androidTest.apk`. Both modes share the disposable verification app ID but retain separate host APKs.

The successful resumed E2E build took 10m 9s, and the normal build took 3m 53s. Those times exclude earlier cold compilation. Under emulation a cold build is substantially slower. Keep the cache; do not add `clean`, broad regression batches or per-minute polling. The requested progress-check interval is four minutes.

Earlier failures and fixes, in order:

1. Crypto module built an unrequested armeabi-v7a ABI after arm64. Stopped that attempt and fixed the module's ABI filter.
2. The first ABI assertion also ran in included plugin builds. Restricted it to the main app build; the focused check passed.
3. WatermelonDB JSI also built unrequested ABIs. Stopped that attempt and configured its filter in the verification init script; the combined assertion passed in 6 seconds.
4. AAPT2 failed on dependency images under QEMU's default CPU. Added the local `-cpu max` wrapper, then resumed successfully.

Both stopped extra-ABI builds retained their completed arm64 outputs. No vendor dependency source was patched.

The earlier host prerequisite verification also passed `bun run test:native-key-crypto` (7 suites, 67 passed, one opt-in fixture capture skipped) and production Android/iOS Hermes exports via `bun run check:production-e2e-bundle`, with both Sentry flags set to `true`. Both exported bytecode bundles passed marker checks. Supporting evidence already included 48 selected restore/workflow tests, five Android backup XML tests, key/data architecture-boundary checks and native E2E typechecking. Those broader checks were not rerun during APK preparation; repeat them only when relevant code/toolchain changes justify it. Full commands and prior evidence are in the [host follow-up](./restore-interruption-verification-plan.md#arm64-host-toolchain-follow-up-2026-10-17) and the verification documents it follows.

## Check the packaged artifacts

Use the AAPT2 wrapper to inspect each app's package and ABI, and `apksigner` to verify all three signatures:

```sh
source .scratch/native-host-env.sh
source scripts/android-env.sh
for mode in e2e normal; do
  "$FFB_AAPT2_OVERRIDE" dump badging "artifacts/native-verification/android/$mode/app-verification.apk"
  "$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose \
    "artifacts/native-verification/android/$mode/app-verification.apk"
done
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose \
  artifacts/native-verification/android/e2e/app-verification-androidTest.apk
"$FFB_AAPT2_OVERRIDE" dump xmltree \
  artifacts/native-verification/android/e2e/app-verification-androidTest.apk --file AndroidManifest.xml
```

Observed: both app IDs were `in.sahilsoni.fullfrillsbalance.verification`, instrumentation targeted that exact ID, native ABI was arm64-v8a only, and all three APKs passed v2 signature verification. Both app APKs contained `lib/arm64-v8a/libFFBKeyCrypto.so` and Hermes libraries.

The packaged bundle/config checks can be repeated without rebuilding:

```sh
python3 - <<'PY'
import json, struct, zipfile
from pathlib import Path

out = Path('artifacts/native-verification/normal-exclusion')
out.mkdir(parents=True, exist_ok=True)
for mode in ('e2e', 'normal'):
    apk = Path('artifacts/native-verification/android') / mode / 'app-verification.apk'
    with zipfile.ZipFile(apk) as archive:
        bundle = archive.read('assets/index.android.bundle')
        config = json.loads(archive.read('assets/app.config'))
        assert config['extra']['e2eHarnessEnabled'] is (mode == 'e2e')
        assert bundle[:8].hex() == 'c61fbc03c103191f'
        assert struct.unpack_from('<I', bundle, 8)[0] == 98
        assert 'lib/arm64-v8a/libFFBKeyCrypto.so' in archive.namelist()
        assert sorted({n.split('/')[1] for n in archive.namelist() if n.startswith('lib/')}) == ['arm64-v8a']
        assert (b'__FFB_E2E_DESTRUCTIVE_BOOTSTRAP__' in bundle) is (mode == 'e2e')
        if mode == 'normal':
            (out / 'index.android.hbc').write_bytes(bundle)
print('Packaged capability, ABI, crypto library and Hermes checks passed')
PY
node scripts/check-e2e-bundle.mjs artifacts/native-verification/normal-exclusion
git diff --check
```

Use `.hbc` for the extracted bytecode: the existing checker scans `.js`/`.hbc`, not `.bundle`. Confirm it reports at least one scanned file. The recorded normal APK passed all three marker exclusions with its embedded E2E flag false; the E2E APK contained the expected bootstrap marker with the flag true. These checks do not execute the app.

## Evidence and remaining work

Ignored evidence directory: `artifacts/native-host-verification-2026-10-17/`.

- `host.json`, `native-key-crypto.log`, `production-hermes.log`, `hermes-bytecode.json`: earlier host C++/export results and compiler metadata.
- `android-host.json`: toolchain, source-file/lock hashes, ABI assertions, build outcomes and pending work.
- `android-artifacts.json`: APK sizes/hashes, packaged bundle/library hashes, E2E flags, ABIs and marker results. Its crypto hash is for the packaged library; the earlier host metadata also records an unstripped build-output hash.
- `android-verification-build.log`, `android-normal-build.log`, `android-abi-check.log`: successful build/configuration logs.
- `android-verification-extra-abi-attempt.log`, `android-verification-watermelon-extra-abi-attempt.log`, `android-verification-abi-check-scope-attempt.log`, `android-verification-aapt-cpu-attempt.log`: earlier stopped/failed attempts.
- `android-*-badging.txt`, `android-instrumentation-manifest.txt`, `android-normal-signature.txt`: static artifact inspection; E2E app/instrumentation signature results were also observed in tool output.

Next: discover an authorized dedicated Android device and establish install/launch and the one entry-point smoke spec using `android.device.verification`. That configuration can reinstall/reset the verification app; do not substitute a production-ID configuration. The spec is prepared and typechecked, but its runtime behavior remains unverified.

Signed iOS builds require macOS/Xcode and provisioning. Real retained-file recovery, bidirectional platform recovery, native A–E controls and process-termination/storage-error tests, vault/lock/key-loss/reinstall, OS backup/transfer behavior and combined physical acceptance remain pending. Native A–E controls are deliberately staged after the real-file native recovery baseline. The [plan's completion table](./native-device-verification-plan.md#local-preparation-record-2026-10-17) tracks these gates.
