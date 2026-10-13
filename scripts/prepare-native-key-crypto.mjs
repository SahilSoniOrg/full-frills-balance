import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'modules/expo-key-crypto/.generated/nlohmann/json.hpp');
const expected = 'aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63';
const hash = value => createHash('sha256').update(value).digest('hex');
let cached;
try {
  cached = await readFile(target);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!cached || hash(cached) !== expected) {
  const response = await fetch(
    'https://raw.githubusercontent.com/nlohmann/json/v3.12.0/single_include/nlohmann/json.hpp',
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error('Native JSON dependency download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected) throw new Error('Native JSON dependency checksum mismatch');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(`${target}.tmp`, bytes);
  await rename(`${target}.tmp`, target);
}
