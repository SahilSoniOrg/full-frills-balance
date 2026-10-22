#!/usr/bin/env bash
# Release-derived disposable app; never installs, launches, or resets a device.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mode="${1:-e2e}"
case "$mode" in
  e2e) export EXPO_PUBLIC_E2E=1 ;;
  normal) export EXPO_PUBLIC_E2E=0 ;;
  *) echo "usage: $0 e2e|normal [Gradle arguments...]" >&2; exit 2 ;;
esac
if [[ $# -gt 0 ]]; then shift; fi

# Select deliberately; an x86 host does not imply an x86 physical device.
arch="${DETOX_ANDROID_ARCH:?Set DETOX_ANDROID_ARCH to the intended Android ABI}"
if [[ ! "$arch" =~ ^(arm64-v8a|armeabi-v7a|x86|x86_64)(,(arm64-v8a|armeabi-v7a|x86|x86_64))*$ ]]; then
  echo "Unsupported DETOX_ANDROID_ARCH: $arch" >&2
  exit 2
fi
source "$ROOT/scripts/android-env.sh"
export APP_VARIANT=production
export SENTRY_DISABLE_AUTO_UPLOAD=true
export SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true

args=(assembleVerification "-PreactNativeArchitectures=$arch"
  --init-script "$ROOT/scripts/check-android-key-abi.gradle")
if [[ -n "${FFB_AAPT2_OVERRIDE:-}" ]]; then
  args+=("-Pandroid.aapt2FromMavenOverride=$FFB_AAPT2_OVERRIDE")
fi
if [[ "$mode" == "e2e" ]]; then
  args+=(assembleVerificationAndroidTest -DtestBuildType=verification)
fi

# Expo and Gradle have separate compiler selectors. Honor the same local
# override without replacing the installed, version-pinned compiler package.
if [[ -n "${REACT_NATIVE_OVERRIDE_HERMES_DIR:-}" ]]; then
  init_script="$(mktemp)"
  trap 'rm -f "$init_script"' EXIT
  cat >"$init_script" <<'GRADLE'
gradle.afterProject { project, state ->
    if (project.path == ':app' && state.failure == null) {
        project.extensions.getByName('react').hermesCommand =
            new File(System.getenv('REACT_NATIVE_OVERRIDE_HERMES_DIR'), 'build/bin/hermesc').absolutePath
    }
}
GRADLE
  args+=(--init-script "$init_script")
fi

cd "$ROOT/android"
./gradlew "${args[@]}" "$@"

# Normal and E2E share the disposable app ID, but retain distinct host artifacts.
output="$ROOT/artifacts/native-verification/android/$mode"
mkdir -p "$output"
cp app/build/outputs/apk/verification/app-verification.apk "$output/"
if [[ "$mode" == "e2e" ]]; then
  cp app/build/outputs/apk/androidTest/verification/app-verification-androidTest.apk "$output/"
fi
printf 'Verification artifacts: %s\n' "$output"
