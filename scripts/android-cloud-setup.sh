#!/usr/bin/env bash
# Idempotent Linux toolchain for Android Detox on a cloud agent.
# Installs Bun, the Android SDK/NDK/emulator, an API 36 x86_64 AVD, and JS deps.
# Does not boot the emulator (that belongs to the Detox run, not every agent boot).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname)" != "Linux" ]]; then
  echo "scripts/android-cloud-setup.sh is for Linux cloud agents. On macOS, install Android Studio and an ARM64 AVD named Pixel_2_API_36_Fast, then run bun run e2e:build:android." >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/android-env.sh"

CMDLINE_REV="13114758"
CMDLINE_URL="https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_REV}_latest.zip"
AVD_NAME="${DETOX_AVD_NAME:-Pixel_2_API_36_Fast}"
SYSTEM_IMAGE="system-images;android-36;google_apis;x86_64"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

sudo_n() {
  if sudo -n "$@"; then
    return 0
  fi
  echo "sudo failed for: $*" >&2
  return 1
}

if ! command -v java >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  sudo_n apt-get update
  sudo_n apt-get install -y --no-install-recommends \
    openjdk-21-jdk-headless unzip curl ca-certificates
fi

# Emulator shared libraries. Package names match Ubuntu 24.04.
if ! dpkg -s libnss3 >/dev/null 2>&1; then
  sudo_n apt-get update
  sudo_n apt-get install -y --no-install-recommends \
    libnss3 libx11-6 libxcomposite1 libxcursor1 libxi6 libxtst6 \
    libxdamage1 libxrandr2 libasound2t64 libpulse0 libgl1 \
    libglib2.0-0t64 libstdc++6
fi

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi
if [[ -x "$HOME/.bun/bin/bun" ]]; then
  sudo_n ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
  sudo_n ln -sf "$HOME/.bun/bin/bunx" /usr/local/bin/bunx
fi
export PATH="$HOME/.bun/bin:$PATH"

mkdir -p "$ANDROID_HOME"
if [[ ! -x "$SDKMANAGER" ]]; then
  tmp="$(mktemp -d)"
  curl -fL --retry 3 --retry-delay 2 -o "$tmp/cmdtools.zip" "$CMDLINE_URL"
  unzip -q "$tmp/cmdtools.zip" -d "$tmp"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi

yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/dev/null || true
"$SDKMANAGER" --sdk_root="$ANDROID_HOME" --install \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "cmake;3.22.1" \
  "cmake;3.30.5" \
  "emulator" \
  "$SYSTEM_IMAGE"

android_ensure_kvm
android_ensure_gradle_heap

if [[ ! -f android/local.properties ]]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" >android/local.properties
fi

if ! "$ANDROID_HOME/emulator/emulator" -list-avds | grep -qx "$AVD_NAME"; then
  echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd \
    --name "$AVD_NAME" \
    --package "$SYSTEM_IMAGE" \
    --device pixel_2 \
    --force
fi

avd_ini="$HOME/.android/avd/${AVD_NAME}.avd/config.ini"
if [[ -f "$avd_ini" ]]; then
  python3 - "$avd_ini" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
updates = {
    "hw.ramSize": "2048",
    "vm.heapSize": "256",
    "hw.cpu.ncore": "2",
    "hw.keyboard": "yes",
    "hw.gpu.enabled": "yes",
    "hw.gpu.mode": "swiftshader_indirect",
    "disk.dataPartition.size": "2048M",
}
text = path.read_text().splitlines()
seen = set()
out = []
for line in text:
    if "=" in line:
        key = line.split("=", 1)[0].strip()
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
            continue
    out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")
PY
fi

# Login shells (cloud install/start) do not read ~/.bashrc. Put the SDK on the default PATH.
if sudo -n true 2>/dev/null; then
  sudo tee /etc/profile.d/android-cloud.sh >/dev/null <<EOF
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$ANDROID_HOME
export ANDROID_SDK_ROOT=\$ANDROID_HOME
export PATH="\$JAVA_HOME/bin:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$PATH"
EOF
fi

if [[ ! -x android/gradlew ]]; then
  CI=1 bunx expo prebuild --platform android --no-install
fi

bun install --frozen-lockfile

if [[ ! -f .env.local && -f .env.e2e.example ]]; then
  cp .env.e2e.example .env.local
fi

echo "Android cloud toolchain ready."
echo "  ANDROID_HOME=$ANDROID_HOME"
echo "  AVD=$AVD_NAME ($SYSTEM_IMAGE)"
echo "  KVM: $(if [[ -r /dev/kvm ]]; then echo readable; else echo unavailable; fi)"
echo "Next: bun run e2e:build:android && bun run e2e:test:android"
