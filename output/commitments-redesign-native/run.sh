#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/output/commitments-redesign-native"
SIMULATOR_ID="7A00412D-BDDA-44E9-94D7-4C8721449B8B"
BASE_APP="$ROOT/ios/build/Build/Products/Release-iphonesimulator/FullFrillsBalance.app"
APP_PATH_FILE="/tmp/commitments-redesign-native-app-path"

usage() {
  echo "Usage: $0 build | install | launch <screen> <light|dark> <320|390> <privacy:0|1> [content-size] [fixture] | content-size <category> | capture <name>" >&2
  exit 2
}

case "${1:-}" in
  build)
    [ -d "$BASE_APP" ] || { echo "Missing simulator app: $BASE_APP" >&2; exit 1; }
    [ -x "$ROOT/node_modules/.bin/expo" ] || { echo 'Local Expo CLI is missing; install project dependencies first.' >&2; exit 1; }
    TASK_TMP="$(mktemp -d /tmp/commitments-redesign-native.XXXXXX)"
    APP="$TASK_TMP/FullFrillsBalance.app"
    mkdir -p "$TASK_TMP/metro-cache"
    ditto "$BASE_APP" "$APP"
    EXPO_PACKAGER_CACHE_ROOT="$TASK_TMP/metro-cache" \
      "$ROOT/node_modules/.bin/expo" export:embed \
      --platform ios \
      --entry-file "$OUT/entry.tsx" \
      --bundle-output "$APP/main.jsbundle" \
      --assets-dest "$APP" \
      --dev false \
      --minify false
    codesign --force --deep --sign - "$APP"
    printf '%s\n' "$APP" > "$APP_PATH_FILE"
    printf 'Built native harness bundle: %s\n' "$APP"
    ;;
  install)
    [ -f "$APP_PATH_FILE" ] || { echo 'Build first.' >&2; exit 1; }
    APP="$(cat "$APP_PATH_FILE")"
    [ -d "$APP" ] || { echo 'Temporary app bundle is missing; build again.' >&2; exit 1; }
    if ! xcrun simctl list devices booted | rg -q "$SIMULATOR_ID"; then
      xcrun simctl boot "$SIMULATOR_ID"
    fi
    xcrun simctl bootstatus "$SIMULATOR_ID" -b
    xcrun simctl install "$SIMULATOR_ID" "$APP"
    APP_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
    xcrun simctl launch "$SIMULATOR_ID" "$APP_ID"
    ;;
  launch)
    [ "$#" -ge 5 ] && [ "$#" -le 7 ] || usage
    SCREEN="$2"
    APPEARANCE="$3"
    WIDTH="$4"
    PRIVACY="$5"
    CONTENT_SIZE="${6:-large}"
    FIXTURE="${7:-default}"
    case "$SCREEN" in budgets|planned|budget-detail|planned-detail) ;; *) usage;; esac
    case "$APPEARANCE" in light|dark) ;; *) usage;; esac
    case "$WIDTH" in 320|390) ;; *) usage;; esac
    case "$PRIVACY" in 0|1) ;; *) usage;; esac
    case "$CONTENT_SIZE" in extra-small|small|medium|large|extra-large|extra-extra-large|extra-extra-extra-large|accessibility-medium|accessibility-large|accessibility-extra-large|accessibility-extra-extra-large|accessibility-extra-extra-extra-large) ;; *) usage;; esac
    case "$FIXTURE" in default|nothing-over|nothing-spent|missing-fx|over-limit|paused|ended) ;; *) usage;; esac
    [ -f "$APP_PATH_FILE" ] || { echo 'Build and install first.' >&2; exit 1; }
    APP="$(cat "$APP_PATH_FILE")"
    APP_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
    xcrun simctl terminate "$SIMULATOR_ID" "$APP_ID" >/dev/null 2>&1 || true
    xcrun simctl ui "$SIMULATOR_ID" appearance "$APPEARANCE"
    xcrun simctl ui "$SIMULATOR_ID" content_size "$CONTENT_SIZE"
    PRIVACY_ARG=false
    [ "$PRIVACY" = 1 ] && PRIVACY_ARG=true
    xcrun simctl launch "$SIMULATOR_ID" "$APP_ID" --screen "$SCREEN" --appearance "$APPEARANCE" --width "$WIDTH" --privacy "$PRIVACY_ARG" --capture true --fixture "$FIXTURE"
    ;;
  content-size)
    [ "$#" -eq 2 ] || usage
    case "$2" in
      extra-small|small|medium|large|extra-large|extra-extra-large|extra-extra-extra-large|accessibility-medium|accessibility-large|accessibility-extra-large|accessibility-extra-extra-large|accessibility-extra-extra-extra-large) ;;
      *) usage ;;
    esac
    xcrun simctl ui "$SIMULATOR_ID" content_size "$2"
    ;;
  capture)
    [ "$#" -eq 2 ] || usage
    [ "${COMMITMENTS_NATIVE_GO:-}" = 1 ] || { echo 'Capture is gated: set COMMITMENTS_NATIVE_GO=1 only after explicit GO.' >&2; exit 1; }
    NAME="$2"
    case "$NAME" in *[!a-zA-Z0-9_-]*|'') echo 'Capture name may contain only letters, numbers, hyphens, and underscores.' >&2; exit 2;; esac
    # Allow the RN root and async font set to finish loading after a native launch.
    sleep 5
    xcrun simctl io "$SIMULATOR_ID" screenshot "$OUT/$NAME.png"
    printf 'Saved native simulator screenshot: %s/%s.png\n' "$OUT" "$NAME"
    ;;
  *) usage ;;
esac
