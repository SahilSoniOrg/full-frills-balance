import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleRoot = path.join(root, 'modules/expo-key-crypto');
const webRoot = path.join(moduleRoot, 'web');
const distDir = path.join(webRoot, 'dist');
const lockPath = path.join(webRoot, 'build-inputs.lock.json');
const EMSDK_VERSION = '3.1.74';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function commandExists(command) {
  return spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : [filename];
  });
}

function inputHash() {
  const hash = createHash('sha256');
  const inputRoots = ['cpp', 'vendor/nlohmann', 'vendor/zstd'];
  const files = [
    ...inputRoots.flatMap(directory => sourceFiles(path.join(moduleRoot, directory))),
    path.join(webRoot, 'bridge.cpp'),
    path.join(root, 'scripts/build-wasm-key-crypto.mjs'),
    path.join(root, 'scripts/sync/embed-dictionaries.mjs'),
    path.join(root, 'scripts/sync/dictionary-pipeline.mjs'),
    path.join(root, 'scripts/sync/generate-corpus.mjs'),
    path.join(root, 'scripts/sync/train-dictionaries.mjs'),
    path.join(root, 'src/services/sync/shortKeys/schema35.json'),
    ...sourceFiles(path.join(root, 'src/services/sync/dictionaries')),
  ].sort();
  for (const filename of files) {
    hash.update(path.relative(root, filename));
    hash.update('\0');
    hash.update(readFileSync(filename));
  }
  hash.update(`emsdk:${EMSDK_VERSION}\0openssl:3.x, Emscripten target\0`);
  return hash.digest('hex');
}

function printEmsdkInstallHelp() {
  console.error(`Emscripten (emcc) not found. Install emsdk ${EMSDK_VERSION}:`);
  console.error('  git clone https://github.com/emscripten-core/emsdk.git ~/emsdk');
  console.error(
    `  cd ~/emsdk && ./emsdk install ${EMSDK_VERSION} && ./emsdk activate ${EMSDK_VERSION}`,
  );
  console.error('  source ~/emsdk/emsdk_env.sh');
}

function printEmsdkActivateHelp() {
  const emsdkEnv = path.join(process.env.HOME ?? '', 'emsdk', 'emsdk_env.sh');
  console.error('Emscripten (emcc) is not on PATH in this shell.');
  if (existsSync(emsdkEnv)) {
    console.error('~/emsdk exists — load it, then rerun from the repo root:');
    console.error('  source ~/emsdk/emsdk_env.sh');
    console.error(`  cd ${root}`);
    console.error('  node scripts/build-wasm-key-crypto.mjs');
  } else {
    printEmsdkInstallHelp();
  }
}

if (!commandExists('emcc')) {
  printEmsdkActivateHelp();
  process.exit(1);
}
if (!run('emcc', ['--version']).includes(EMSDK_VERSION)) {
  console.error(`This build is pinned to emsdk ${EMSDK_VERSION}.`);
  process.exit(1);
}

const opensslPrefix = process.env.FFB_WASM_OPENSSL_PREFIX;
if (!opensslPrefix) {
  console.error('FFB_WASM_OPENSSL_PREFIX is not set.');
  console.error('Build OpenSSL for wasm once (see scripts/build-openssl-wasm.sh), then:');
  console.error('  export FFB_WASM_OPENSSL_PREFIX="$HOME/emscripten-openssl-ffb"');
  console.error('  node scripts/build-wasm-key-crypto.mjs');
  process.exit(1);
}

const includeDir = path.join(opensslPrefix, 'include');
const cryptoArchive = path.join(opensslPrefix, 'lib/libcrypto.a');
if (!existsSync(path.join(includeDir, 'openssl/hpke.h')) || !existsSync(cryptoArchive)) {
  console.error('FFB_WASM_OPENSSL_PREFIX must contain include/openssl/hpke.h and lib/libcrypto.a');
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
const cppSources = [
  'cpp/CryptoPrimitives.cpp',
  'cpp/ProtocolEnvelopes.cpp',
  'cpp/KeyEngine.cpp',
  'cpp/RowCodec.cpp',
  'cpp/RowCrypto.cpp',
  'cpp/RowDictionaries.cpp',
  'web/bridge.cpp',
].map(filename => path.join(moduleRoot, filename));
const zstdSource = path.join(moduleRoot, 'vendor/zstd/zstd.c');
const zstdObject = path.join(distDir, '.build-zstd.o');
const loaderPath = path.join(distDir, 'key-crypto.mjs');
run('emcc', [
  '-c',
  zstdSource,
  '-O3',
  `-I${path.join(moduleRoot, 'vendor/zstd')}`,
  '-o',
  zstdObject,
]);
run('emcc', [
  '-DFFB_KEY_CRYPTO_TEST',
  ...cppSources,
  zstdObject,
  '-std=c++20',
  '-O3',
  '-fexceptions',
  '-sDISABLE_EXCEPTION_CATCHING=0',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sASYNCIFY',
  '--bind',
  '-sENVIRONMENT=web,worker,node',
  '-sEXPORTED_FUNCTIONS=["_ffb_key_crypto_execute","_ffb_key_crypto_set_allowed","_malloc","_free"]',
  '-sEXPORTED_RUNTIME_METHODS=["ccall","UTF8ToString"]',
  `-I${path.join(moduleRoot, 'cpp')}`,
  `-I${path.join(moduleRoot, 'vendor')}`,
  `-I${path.join(moduleRoot, 'vendor/zstd')}`,
  `-I${includeDir}`,
  cryptoArchive,
  '-o',
  loaderPath,
]);

const nextLock = {
  emsdk: EMSDK_VERSION,
  openssl: '3.x, Emscripten target',
  inputsSha256: inputHash(),
};
writeFileSync(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`);
console.log(
  `Built ${path.relative(root, loaderPath)} and ${path.relative(root, path.join(distDir, 'key-crypto.wasm'))}`,
);
