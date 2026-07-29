#!/usr/bin/env bash
# Clean Detox iOS Release build (embedded bundle, no dev client) + full e2e/specs run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEVICE_NAME="${DETOX_IOS_DEVICE:-iPhone 17}"

echo "==> Cleaning build artifacts"
rm -rf ios/build artifacts/detox
mkdir -p artifacts/detox

UDID="$(xcrun simctl list devices available | grep -F "${DEVICE_NAME} (" | head -1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')"
echo "==> Simulator ${DEVICE_NAME} (${UDID})"
xcrun simctl boot "${UDID}" 2>/dev/null || true
xcrun simctl bootstatus "${UDID}" -b
xcrun simctl uninstall "${UDID}" in.sahilsoni.fullfrillsbalance 2>/dev/null || true

echo "==> Pods + Detox caches"
(cd ios && pod install)
npx detox clean-framework-cache && npx detox build-framework-cache

test -f .env.local || cp .env.e2e.example .env.local

echo "==> Building Release simulator app (EXPO_PUBLIC_E2E=1, embedded JS)"
EXPO_PUBLIC_E2E=1 bun run e2e:build:ios

echo "==> Running Detox specs (no Metro)"
EXPO_PUBLIC_E2E=1 bun run e2e:ci
