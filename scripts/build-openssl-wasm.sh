#!/usr/bin/env bash
# One-time OpenSSL 3.3.x static build for Emscripten (HPKE). Output: $PREFIX with include/ and lib/libcrypto.a
set -euo pipefail

EMSDK_VERSION=3.1.74
PREFIX="${FFB_WASM_OPENSSL_PREFIX:-$HOME/emscripten-openssl-ffb}"
OPENSSL_TAG=openssl-3.3.2
BUILD_DIR="${TMPDIR:-/tmp}/ffb-openssl-wasm-build-$$"

if ! command -v emcc >/dev/null 2>&1; then
  if [[ -f "$HOME/emsdk/emsdk_env.sh" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/emsdk/emsdk_env.sh"
  fi
fi

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc not found. Run: source ~/emsdk/emsdk_env.sh (emsdk ${EMSDK_VERSION})" >&2
  exit 1
fi
if ! emcc --version | grep -q "${EMSDK_VERSION}"; then
  echo "This repo pins emsdk ${EMSDK_VERSION}. Active: $(emcc --version | head -1)" >&2
  exit 1
fi

if [[ -f "$PREFIX/include/openssl/hpke.h" && -f "$PREFIX/lib/libcrypto.a" ]]; then
  echo "OpenSSL wasm already installed at $PREFIX"
  exit 0
fi

rm -rf "$BUILD_DIR"
git clone --depth 1 --branch "$OPENSSL_TAG" https://github.com/openssl/openssl.git "$BUILD_DIR"
cd "$BUILD_DIR"

emconfigure ./Configure linux-generic32 \
  --prefix="$PREFIX" \
  --openssldir="$PREFIX/ssl" \
  no-shared no-threads no-tests no-ui-console no-asm no-afalgeng

sed -i.bak 's/^CROSS_COMPILE=.*/CROSS_COMPILE=/' Makefile
sed -i.bak 's/-ldl //g' Makefile

emmake make -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)" build_generated libcrypto.a libssl.a
emmake make install_sw

if [[ ! -f "$PREFIX/include/openssl/hpke.h" ]]; then
  echo "Build finished but hpke.h is missing (need OpenSSL 3.2+)." >&2
  exit 1
fi

echo "Installed to $PREFIX"
echo "Next:"
echo "  export FFB_WASM_OPENSSL_PREFIX=\"$PREFIX\""
echo "  cd $(cd "$(dirname "$0")/.." && pwd) && node scripts/build-wasm-key-crypto.mjs"
