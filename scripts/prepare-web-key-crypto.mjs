import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Expo copies public/ verbatim; the Emscripten loader must remain an ES module.
const source = new URL('../modules/expo-key-crypto/web/dist/', import.meta.url);
const destination = new URL('../public/key-crypto/', import.meta.url);
mkdirSync(destination, { recursive: true });
for (const filename of ['key-crypto.mjs', 'key-crypto.wasm']) {
  copyFileSync(new URL(filename, source), new URL(filename, destination));
}
console.log(`Prepared web encryption assets in ${fileURLToPath(destination)}`);
