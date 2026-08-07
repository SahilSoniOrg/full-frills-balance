#!/usr/bin/env bash
# Run all native E2E checks locally (no EAS). Requires Android emulator and/or iOS simulator.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.maestro/bin:${PATH}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
export EXPO_PUBLIC_E2E=1

if [[ ! -f .env.local ]]; then
  cp .env.e2e.example .env.local
fi

echo "==> Jest SMS integration tests"
bunx jest --testPathPattern="SmsSyncPipeline.integration|transactionInboxMapping.integration|smsDuplicateDetection|SmsSyncPipeline.test|SmsReferenceExtractor" --coverage=false

if [[ -f android/app/build/outputs/apk/release/app-release.apk ]]; then
  echo "==> Maestro (Android)"
  "$ADB" install -r android/app/build/outputs/apk/release/app-release.apk
  maestro test .maestro
else
  echo "==> Skipping Maestro: build release APK first (bun run e2e:build:android)"
fi

if [[ -f android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk ]]; then
  echo "==> Detox Android smoke"
  bunx detox test --configuration android.emu.release e2e/specs/smoke --runInBand
else
  echo "==> Skipping Detox Android: run bun run e2e:build:android"
fi

if [[ -d ios/build/Build/Products/Release-iphonesimulator/FullFrillsBalance.app ]]; then
  echo "==> Detox iOS"
  bunx detox test --configuration ios.sim.release e2e/specs/smoke --runInBand
else
  echo "==> Skipping Detox iOS: run bun run e2e:build:ios"
fi

echo "==> Local E2E complete"
