#!/usr/bin/env bash
# Shared Android/Detox environment. Safe to source from other scripts.
# Does not install packages.

if [[ -z "${JAVA_HOME:-}" && -d /usr/lib/jvm/java-21-openjdk-amd64 ]]; then
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ "$(uname)" == "Darwin" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  else
    export ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

path_prefix=""
if [[ -n "${JAVA_HOME:-}" ]]; then
  path_prefix="$JAVA_HOME/bin:"
fi
export PATH="${path_prefix}${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"

# Linux x86_64 cannot run the arm64-only native libs from android/gradle.properties.
if [[ "$(uname)" == "Linux" && "$(uname -m)" == "x86_64" && -z "${DETOX_ANDROID_ARCH:-}" ]]; then
  export DETOX_ANDROID_ARCH=x86_64
fi

android_ensure_kvm() {
  if [[ ! -e /dev/kvm ]]; then
    return 0
  fi
  if [[ -r /dev/kvm && -w /dev/kvm ]]; then
    return 0
  fi
  if sudo -n chmod 666 /dev/kvm 2>/dev/null; then
    return 0
  fi
  echo "KVM is present at /dev/kvm but this user cannot read it. The emulator will fall back to slow software emulation, or fail." >&2
}

# `emulator -accel-check` only checks that /dev/kvm opens. Nested cloud kernels
# can still BUG in kvm_arch_vcpu_create (seen on 6.12: kernel BUG at
# arch/x86/kvm/x86.c kvm_arch_vcpu_create). Every emulator build issues
# KVM_CREATE_VCPU for `-accel on`; a different binary or flag cannot skip that
# ioctl. Cache the result: the failing probe segfaults and dirties the kernel log.
android_resolve_emulator_accel() {
  if [[ "$(uname)" != "Linux" ]]; then
    return 0
  fi
  if [[ -n "${DETOX_EMULATOR_BOOT_ARGS:-}" ]]; then
    return 0
  fi
  local cache="${HOME}/.android/kvm-vcpu-probe"
  mkdir -p "${HOME}/.android"
  if [[ ! -f "$cache" ]]; then
    if python3 - <<'PY'
import fcntl, os, sys
fd = os.open("/dev/kvm", os.O_RDWR)
vm = fcntl.ioctl(fd, 0xAE01, 0)  # KVM_CREATE_VM
fcntl.ioctl(vm, 0xAE41, 0)  # KVM_CREATE_VCPU
PY
    then
      echo on >"$cache"
    else
      echo off >"$cache"
    fi
  fi
  if [[ "$(cat "$cache")" == "on" ]]; then
    export DETOX_EMULATOR_BOOT_ARGS="-accel on"
  else
    export DETOX_EMULATOR_BOOT_ARGS="-accel off"
    echo "KVM cannot create a vCPU on this kernel. Android emulator will use software emulation (-accel off), which is much slower than KVM." >&2
  fi
}

# Launch the Detox AVD if needed and block until package + settings services answer.
# Detox reuses a running emulator whose `adb emu avd name` matches. Do not start a
# second one while QEMU is already up: a read-only sibling drops those services.
android_snapshot_dir() {
  local avd="${1:-${DETOX_AVD_NAME:-Pixel_2_API_36_Fast}}"
  echo "${HOME}/.android/avd/${avd}.avd/snapshots/detox-ready"
}

android_emulator_services_ready() {
  local adb="$ANDROID_HOME/platform-tools/adb"
  local avd boot pkg settings name
  avd="${DETOX_AVD_NAME:-Pixel_2_API_36_Fast}"
  boot="$("$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
  [[ "$boot" == "1" ]] || return 1
  pkg="$("$adb" shell service check package 2>/dev/null | tr -d '\r')"
  [[ "$pkg" == *"found"* ]] || return 1
  settings="$("$adb" shell service check settings 2>/dev/null | tr -d '\r')"
  [[ "$settings" == *"found"* ]] || return 1
  "$adb" shell cmd package list packages android >/dev/null 2>&1 || return 1
  name="$("$adb" emu avd name 2>/dev/null | tr -d '\r' | head -n 1)"
  [[ "$name" == "$avd" ]] || return 1
  return 0
}

android_boot_emulator_for_detox() {
  local avd adb emu boot_args snap_args i snap
  avd="${DETOX_AVD_NAME:-Pixel_2_API_36_Fast}"
  adb="$ANDROID_HOME/platform-tools/adb"
  emu="$ANDROID_HOME/emulator/emulator"
  snap="$(android_snapshot_dir "$avd")"
  boot_args=()
  if [[ -n "${DETOX_EMULATOR_BOOT_ARGS:-}" ]]; then
    # shellcheck disable=SC2206
    boot_args=(${DETOX_EMULATOR_BOOT_ARGS})
  fi
  # Guest software GLES. Host swiftshader left the main thread in
  # IGraphicsStats.requestBufferForProcess long enough for Detox's 5s ANR watchdog.
  # `-gpu software` is last so it wins over an earlier Detox/AVD gpu flag.
  snap_args=(-no-snapshot-load -no-snapshot-save)
  if [[ -d "$snap" ]]; then
    echo "Loading booted snapshot detox-ready"
    snap_args=(-snapshot detox-ready -no-snapshot-save)
  fi

  "$adb" start-server >/dev/null
  if android_emulator_services_ready; then
    echo "Android emulator is already booted (package and settings services are up)."
  elif pgrep -f 'qemu-system-x86_64' >/dev/null 2>&1; then
    echo "QEMU is already running for ${avd}; waiting for package and settings services."
  else
    echo "Booting AVD ${avd} (${DETOX_EMULATOR_BOOT_ARGS:-default accel}, software GPU)..."
    nohup "$emu" -avd "$avd" -port 5554 -no-window -no-audio -no-boot-anim -no-metrics \
      -memory 3072 -cores 4 \
      "${boot_args[@]}" "${snap_args[@]}" -gpu software \
      >"${HOME}/.android/emulator-detox.log" 2>&1 &
    echo $! >"${HOME}/.android/emulator-detox.pid"
  fi

  "$adb" wait-for-device
  for i in $(seq 1 90); do
    if android_emulator_services_ready; then
      "$adb" shell settings put global window_animation_scale 0 >/dev/null
      "$adb" shell settings put global transition_animation_scale 0 >/dev/null
      "$adb" shell settings put global animator_duration_scale 0 >/dev/null
      echo "Android package and settings services are up."
      # A Detox relaunch should resume this snapshot instead of cold-booting.
      if [[ -d "$snap" ]]; then
        export DETOX_EMULATOR_BOOT_ARGS="${DETOX_EMULATOR_BOOT_ARGS:-} -snapshot detox-ready -no-snapshot-save -gpu software"
      fi
      return 0
    fi
    sleep 10
  done
  echo "Android package/settings services did not start. Emulator log tail:" >&2
  tail -n 40 "${HOME}/.android/emulator-detox.log" >&2 || true
  return 1
}

# Install the release APKs once, then snapshot. Later files use `pm clear`
# (DETOX_REUSE_INSTALLED_APP) instead of uninstall/reinstall + dex2oat.
android_install_detox_apks_and_snapshot() {
  local adb avd snap app test_apk
  adb="$ANDROID_HOME/platform-tools/adb"
  avd="${DETOX_AVD_NAME:-Pixel_2_API_36_Fast}"
  snap="$(android_snapshot_dir "$avd")"
  app="${1:-android/app/build/outputs/apk/release/app-release.apk}"
  test_apk="${2:-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk}"
  if [[ ! -f "$app" || ! -f "$test_apk" ]]; then
    echo "Missing Detox APKs. Run bun run e2e:build:android first." >&2
    return 1
  fi
  if [[ -d "$snap" && "$snap" -nt "$app" && "$snap" -nt "$test_apk" ]]; then
    if "$adb" shell pm path in.sahilsoni.fullfrillsbalance >/dev/null 2>&1 \
      && "$adb" shell pm path in.sahilsoni.fullfrillsbalance.test >/dev/null 2>&1; then
      echo "Reusing snapshotted Detox install."
      return 0
    fi
  fi
  echo "Installing Detox APKs (one time for this snapshot)..."
  "$adb" install -r -t -g "$app"
  "$adb" install -r -t -g "$test_apk"
  echo "Saving booted snapshot detox-ready..."
  "$adb" emu avd snapshot save detox-ready
  export DETOX_EMULATOR_BOOT_ARGS="${DETOX_EMULATOR_BOOT_ARGS:-} -snapshot detox-ready -no-snapshot-save -gpu software"
}

# Detox kills `adb install` after 60s. A 65MB release APK on software emulation
# does not finish that quickly, and the killed install fails the suite.
android_relax_detox_adb_timeouts() {
  local root="${1:-.}"
  local adb_js="$root/node_modules/detox/src/devices/common/drivers/android/exec/ADB.js"
  if [[ ! -f "$adb_js" ]]; then
    return 0
  fi
  python3 - "$adb_js" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
old = "const DEFAULT_INSTALL_OPTIONS = {\n  timeout: 60000,\n  retries: 3,\n};"
new = "const DEFAULT_INSTALL_OPTIONS = {\n  timeout: 600000,\n  retries: 3,\n};"
if old in text:
    path.write_text(text.replace(old, new, 1))
    print("Raised Detox adb install timeout from 60s to 600s for slow emulation.")
PY
}

android_ensure_gradle_heap() {
  local mem_kb gradle_home props
  mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  if [[ "$mem_kb" -eq 0 || "$mem_kb" -ge 24000000 ]]; then
    return 0
  fi
  gradle_home="${GRADLE_USER_HOME:-$HOME/.gradle}"
  props="$gradle_home/gradle.properties"
  mkdir -p "$gradle_home"
  if [[ -f "$props" ]] && grep -q '^org.gradle.jvmargs=.*-XX:MaxMetaspaceSize=1536m' "$props"; then
    return 0
  fi
  # User-level gradle.properties outranks the project file.
  # R8 on this app exhausts a 512m metaspace. Keep the heap under the 16GB VM
  # and run one worker so lint and minify do not stack.
  cat >"$props" <<'EOF'
org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=1536m -XX:+UseParallelGC -Dfile.encoding=UTF-8
org.gradle.parallel=false
org.gradle.workers.max=1
org.gradle.daemon=true
org.gradle.caching=true
android.lint.checkReleaseBuilds=false
EOF
}
