#!/usr/bin/env bash
# Build or run the Android Detox suite.
# macOS: uses the host Android SDK and the AVD named by DETOX_AVD_NAME (default Pixel_2_API_36_Fast).
# Linux: sources scripts/android-env.sh, which selects an x86_64 APK and a headless emulator.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/android-env.sh"

mode="${1:-}"
if [[ "$mode" != "build" && "$mode" != "test" ]]; then
  echo "usage: $0 build|test [spec paths...]" >&2
  exit 2
fi
shift || true

if [[ ! -f .env.local && -f .env.e2e.example ]]; then
  cp .env.e2e.example .env.local
fi

android_ensure_kvm
android_resolve_emulator_accel
android_ensure_gradle_heap

if [[ ! -f android/local.properties && -d "$ANDROID_HOME" ]]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" >android/local.properties
fi

export EXPO_PUBLIC_E2E=1
export SENTRY_DISABLE_AUTO_UPLOAD="${SENTRY_DISABLE_AUTO_UPLOAD:-true}"

if [[ "$mode" == "build" ]]; then
  exec bunx detox build --configuration android.emu.release
fi

# Software emulation reports boot-complete before package/settings exist.
# Boot first, install the APKs once, and snapshot that state so Detox reuses it.
# DETOX_REUSE_INSTALLED_APP makes launch helpers `pm clear` instead of reinstalling.
if [[ "$(uname)" == "Linux" ]]; then
  android_boot_emulator_for_detox
  android_install_detox_apks_and_snapshot
  android_relax_detox_adb_timeouts "$ROOT"
  export DETOX_REUSE_INSTALLED_APP=1
  export DETOX_JEST_TIMEOUT_MS="${DETOX_JEST_TIMEOUT_MS:-600000}"
  rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/Detox/device.registry.json"
fi

specs=("$@")
if [[ ${#specs[@]} -eq 0 ]]; then
  specs=(e2e/specs)
fi

exec bunx detox test --configuration android.emu.release "${specs[@]}" --runInBand
