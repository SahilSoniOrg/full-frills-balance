# WebAssembly build (Expo web)

## Toolchain

- Emscripten 3.1.74 (`emcc --version` must report 3.1.74)
- OpenSSL 3.x built for Emscripten (`linux-generic32` + `emcc`), including HPKE headers
- OpenSSL prefix containing `include/openssl/hpke.h` and `lib/libcrypto.a`

Install and activate emsdk:

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install 3.1.74 && ./emsdk activate 3.1.74
source ~/emsdk/emsdk_env.sh
```

Load Emscripten in **every new shell** before building (`emcc` is not on PATH until you do):

```bash
source ~/emsdk/emsdk_env.sh
cd /path/to/full-frills-balance
```

Build OpenSSL for Emscripten once (default install prefix `~/emscripten-openssl-ffb`):

```bash
source ~/emsdk/emsdk_env.sh
bash scripts/build-openssl-wasm.sh
export FFB_WASM_OPENSSL_PREFIX="$HOME/emscripten-openssl-ffb"
```

The wasm key build script does not fetch OpenSSL itself.

## Build and parity check

From the repository root:

```bash
FFB_WASM_OPENSSL_PREFIX=/path/to/emscripten-openssl node scripts/build-wasm-key-crypto.mjs
node scripts/test-wasm-key-crypto.mjs
```

The build emits `dist/key-crypto.wasm`, the generated ES module loader, and `build-inputs.lock.json`. The lock hashes the C++ sources, vendored dependencies, bridge, build script, dictionary embedding/provenance scripts, schema map, dictionary bytes and lock metadata; the parity runner rejects stale artifacts. The runner uses the shared `row-vectors.json` row codec and manifest oracle in Node.

## Worker vault

`webVault.ts` (worker-only) stores Android-aligned `AES-256-GCM` records in IndexedDB, with a non-extractable wrap key in a separate database. The Emscripten bridge calls `Module.ffbVault` through Asyncify (`-sASYNCIFY`).

## Expo development and export

`bun start`, `bun run web`, `bun run build:web` and `bun run e2e:build:web` stage
the checked-in loader and WASM into the generated `public/key-crypto/` directory.
Expo serves these files directly and copies them into the web export. The worker
imports the loader as native ESM, bypassing Metro so Emscripten's `import.meta.url`
keeps its browser meaning. The worker itself remains bundled by Metro.

When invoking Expo directly, first run `node scripts/prepare-web-key-crypto.mjs`.
Missing artifacts fail preparation; WASM or vault load failures must fail closed.
Do not add a TypeScript HPKE fallback.
