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
  echo "usage: $0 build|test" >&2
  exit 2
fi

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

exec bunx detox test --configuration android.emu.release e2e/specs --runInBand
