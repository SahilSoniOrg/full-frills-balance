import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(root, 'modules/expo-key-crypto/web');
const distDir = path.join(webRoot, 'dist');
const wasmPath = path.join(distDir, 'key-crypto.wasm');
const loaderPath = path.join(distDir, 'key-crypto.mjs');
const lockPath = path.join(webRoot, 'build-inputs.lock.json');
const emsdk = '3.1.74';

function fail(message) {
  console.error(`test:wasm-key-crypto failed: ${message}`);
  process.exit(1);
}

const requireArtifact = process.env.FFB_REQUIRE_WASM_ARTIFACT === '1' || process.env.CI === 'true';

function isStubLoader() {
  if (!existsSync(loaderPath)) return true;
  const source = readFileSync(loaderPath, 'utf8');
  return source.includes('Runtime placeholder until');
}

if (!existsSync(wasmPath) || !existsSync(loaderPath) || isStubLoader()) {
  const message =
    'WASM artifact is missing or still the checked-in stub (see modules/expo-key-crypto/web/README.md)';
  if (requireArtifact) fail(message);
  console.log(`test:wasm-key-crypto skipped: ${message}`);
  process.exit(0);
}
if (!existsSync(lockPath)) fail('WASM build input lock is missing; rebuild the artifact.');
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(filename) : [filename];
  });
}
function hashInputs() {
  const moduleRoot = path.join(root, 'modules/expo-key-crypto');
  const files = [
    ...['cpp', 'vendor/nlohmann', 'vendor/zstd'].flatMap(directory =>
      filesIn(path.join(moduleRoot, directory)),
    ),
    path.join(webRoot, 'bridge.cpp'),
    path.join(root, 'scripts/build-wasm-key-crypto.mjs'),
    path.join(root, 'scripts/sync/embed-dictionaries.mjs'),
    path.join(root, 'scripts/sync/dictionary-pipeline.mjs'),
    path.join(root, 'scripts/sync/generate-corpus.mjs'),
    path.join(root, 'scripts/sync/train-dictionaries.mjs'),
    path.join(root, 'src/services/sync/shortKeys/schema35.json'),
    ...filesIn(path.join(root, 'src/services/sync/dictionaries')),
  ].sort();
  const hash = createHash('sha256');
  for (const filename of files) {
    hash.update(path.relative(root, filename));
    hash.update('\0');
    hash.update(readFileSync(filename));
  }
  hash.update(`emsdk:${emsdk}\0openssl:3.x, Emscripten target\0`);
  return hash.digest('hex');
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
if (lock.emsdk !== emsdk || lock.inputsSha256 !== hashInputs())
  fail('C++ or build inputs changed since the WASM artifact was built. Rebuild it.');

const loaderUrl = pathToFileURL(loaderPath).href;
const { default: createModule } = await import(loaderUrl);
const wasm = await createModule({ locateFile: file => path.join(distDir, file) });
const vectors = JSON.parse(
  readFileSync(path.join(root, 'modules/expo-key-crypto/tests/fixtures/row-vectors.json'), 'utf8'),
);
const malformedTlvHex = ['0102000100', '0101000100', '010100', '01017f', '010180', '01018000'];
const malformedVarintHex = ['8000', '80', '8080808080808010'];
const pointer = wasm.ccall(
  'ffb_key_crypto_execute',
  'number',
  ['string', 'string'],
  ['test.rowCodec', JSON.stringify({ vectors, malformedTlvHex, malformedVarintHex })],
);
if (typeof pointer !== 'number' || pointer === 0) fail('WASM row vector call returned no result.');
let result;
try {
  result = JSON.parse(wasm.UTF8ToString(pointer));
} finally {
  wasm._free(pointer);
}
if (result.error) fail(`WASM returned ${result.error}.`);
const expected = { ok: true, rows: vectors.tables.length, manifest: true, malformedCases: 14 };
if (JSON.stringify(result) !== JSON.stringify(expected))
  fail(
    `Row vector parity mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}.`,
  );
console.log(
  `WASM row codec parity passed (${vectors.tables.length} shared row vectors + manifest and malformed inputs).`,
);
