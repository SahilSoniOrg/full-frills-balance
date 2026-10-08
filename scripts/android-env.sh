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

# The committed Gradle file asks for an 8g heap, which does not fit a 16GB cloud VM.
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
