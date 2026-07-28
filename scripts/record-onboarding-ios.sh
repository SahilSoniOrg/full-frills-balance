#!/usr/bin/env bash
# Records onboarding on the iOS Simulator (Metro must be running on :8081).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/artifacts/onboarding-ios.mp4}"
FLOW="$ROOT/maestro/onboarding-recording.yaml"
DEVICE_NAME="${IOS_SIMULATOR_DEVICE:-iPhone 17 Daily}"
METRO_URL="${DETOX_METRO_URL:-http://$(ipconfig getifaddr en0 2>/dev/null || echo 127.0.0.1):8081}"
DEV_CLIENT_URL="exp+full-frills-balance://expo-development-client/?url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${METRO_URL}', safe=''))")"

export PATH="${HOME}/.maestro/bin:${PATH}"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=1

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

if ! curl -sf "http://localhost:8081/status" >/dev/null; then
  echo "Metro is not running. Start it with: bun start"
  exit 1
fi

APP_PATH="$ROOT/ios/build/Build/Products/Debug-iphonesimulator/FullFrillsBalance.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Building simulator app…"
  (cd "$ROOT" && bun run test:detox:build)
fi

UDID="$(xcrun simctl list devices available -j | python3 -c "
import json, sys
name = '''${DEVICE_NAME}'''
for d in json.load(sys.stdin).get('devices', {}).values():
  for dev in d:
    if dev.get('name') == name and dev.get('isAvailable'):
      print(dev['udid'])
      sys.exit(0)
sys.exit(1)
")"

echo "Recording onboarding → ${OUT}"
echo "Simulator: ${DEVICE_NAME} (${UDID}) | Metro: ${METRO_URL}"

xcrun simctl shutdown all 2>/dev/null || true
xcrun simctl boot "$UDID"
open -a Simulator --args -CurrentDeviceUDID "$UDID" 2>/dev/null || true

xcrun simctl uninstall "$UDID" in.sahilsoni.fullfrillsbalance 2>/dev/null || true
xcrun simctl install "$UDID" "$APP_PATH"

xcrun simctl io "$UDID" recordVideo --codec=h264 --force "$OUT" 2>/tmp/onboarding-rec.log &
REC_PID=$!
for _ in $(seq 1 60); do
  grep -q 'Recording started' /tmp/onboarding-rec.log 2>/dev/null && break
  sleep 0.2
done
sleep 1

MAESTRO_EXIT=0
maestro test \
  --udid "$UDID" \
  -e "DEV_CLIENT_URL=${DEV_CLIENT_URL}" \
  -e "METRO_URL=${METRO_URL}" \
  "$FLOW" || MAESTRO_EXIT=$?

sleep 2
kill -INT "$REC_PID" 2>/dev/null || true
wait "$REC_PID" 2>/dev/null || true

if [[ ! -f "$OUT" ]]; then
  echo "Recording file was not created."
  exit 1
fi

echo "Saved: $OUT ($(du -h "$OUT" | awk '{print $1}'))"
exit "$MAESTRO_EXIT"
