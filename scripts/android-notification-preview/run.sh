#!/usr/bin/env bash
set -euo pipefail

preview_root="$(cd "$(dirname "$0")" && pwd)"
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$sdk_root" ]]; then
  if [[ "$(uname)" == Darwin ]]; then
    sdk_root="$HOME/Library/Android/sdk"
  else
    sdk_root="$HOME/Android/Sdk"
  fi
fi

build_only=false
standard=false
for argument in "$@"; do
  case "$argument" in
    --build-only) build_only=true ;;
    --standard) standard=true ;;
    *) echo "Usage: bash $0 [--build-only] [--standard]" >&2; exit 1 ;;
  esac
done

build_tools="$sdk_root/build-tools/${ANDROID_BUILD_TOOLS_VERSION:-36.0.0}"
android_jar="$sdk_root/platforms/android-36/android.jar"
adb="$sdk_root/platform-tools/adb"
build_root="$preview_root/build"
for prerequisite in "$build_tools/aapt2" "$build_tools/lib/d8.jar" "$build_tools/lib/apksigner.jar" "$android_jar" "$adb"; do
  if [[ ! -f "$prerequisite" ]]; then
    echo "Missing Android SDK component: $prerequisite. Install Platform 36, Build Tools 36.0.0, and Platform Tools in Android Studio." >&2
    exit 1
  fi
done
for prerequisite in java javac jar keytool; do
  if ! command -v "$prerequisite" >/dev/null 2>&1; then
    echo "Missing $prerequisite. Put a JDK 17 or newer on PATH." >&2
    exit 1
  fi
done

mkdir -p "$build_root/generated" "$build_root/classes" "$build_root/dex"
"$build_tools/aapt2" compile --dir "$preview_root/res" -o "$build_root/resources.zip"
"$build_tools/aapt2" link -I "$android_jar" --manifest "$preview_root/AndroidManifest.xml" --java "$build_root/generated" -o "$build_root/preview.apk" "$build_root/resources.zip"
javac -encoding UTF-8 --release 8 -classpath "$android_jar" -d "$build_root/classes" "$preview_root/MainActivity.java" "$build_root/generated/in/sahilsoni/ffbnotificationpreview/R.java"
class_files=()
while IFS= read -r class_file; do
  class_files+=("$class_file")
done < <(find "$build_root/classes" -type f -name '*.class')
java -cp "$build_tools/lib/d8.jar" com.android.tools.r8.D8 --lib "$android_jar" --output "$build_root/dex" "${class_files[@]}"
jar uf "$build_root/preview.apk" -C "$build_root/dex" classes.dex
if [[ ! -f "$build_root/preview.keystore" ]]; then
  keytool -genkeypair -keystore "$build_root/preview.keystore" -storepass android -keypass android -alias preview -keyalg RSA -keysize 2048 -validity 365 -dname 'CN=Notification Preview' -noprompt
fi
apk="$build_root/notification-preview.apk"
java -jar "$build_tools/lib/apksigner.jar" sign --ks "$build_root/preview.keystore" --ks-pass pass:android --key-pass pass:android --out "$apk" "$build_root/preview.apk"
java -jar "$build_tools/lib/apksigner.jar" verify "$apk"
echo "Built $apk"
if [[ "$build_only" == true ]]; then
  exit 0
fi

if [[ "$("$adb" get-state 2>/dev/null)" != device ]]; then
  echo 'Start an AVD in Android Studio first. With multiple devices, set ANDROID_SERIAL to its adb serial.' >&2
  "$adb" devices
  exit 1
fi
package=in.sahilsoni.ffbnotificationpreview
"$adb" install -r "$apk"
api_level="$("$adb" shell getprop ro.build.version.sdk | tr -d '\r')"
if ((api_level >= 33)); then
  "$adb" shell pm grant "$package" android.permission.POST_NOTIFICATIONS
fi
"$adb" shell am force-stop "$package"
"$adb" shell am start -n "$package/.MainActivity" --ez standard "$standard"
"$adb" shell cmd statusbar expand-notifications
echo 'Two sample transactions appear under FFB Preview. Expand a notification to see its tinted panel.'
