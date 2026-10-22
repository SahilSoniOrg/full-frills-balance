import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'modules/expo-key-crypto/vendor/nlohmann/json.hpp');
const expected = 'aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63';
const bytes = await readFile(target);
if (createHash('sha256').update(bytes).digest('hex') !== expected)
  throw new Error('Vendored nlohmann/json 3.12.0 checksum mismatch');
