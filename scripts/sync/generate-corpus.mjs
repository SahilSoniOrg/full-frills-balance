import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, inputs, corpusRows, corpusBytes, sha256, pretty } from './dictionary-pipeline.mjs';

export async function generateCorpus({
  out = resolve(root, '.generated/sync-corpus'),
  check = false,
} = {}) {
  const { maps, recipe, tables, mapSha256, recipeSha256 } = await inputs();
  const records = [];
  if (!check) await mkdir(out, { recursive: true });
  for (const table of tables) {
    const bytes = corpusBytes(corpusRows(table, maps[table], recipe));
    const file = `${table}.ndjson`;
    if (check) {
      if (!bytes.equals(await readFile(resolve(out, file))))
        throw new Error(`Corpus drift: ${table}`);
    } else await writeFile(resolve(out, file), bytes);
    records.push({
      table,
      file,
      rows: recipe.samplesPerTable,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  const manifest = pretty({
    formatVersion: 1,
    schemaVersion: 35,
    seed: recipe.seed,
    mapSha256,
    recipeSha256,
    tables: records,
  });
  const target = resolve(out, 'corpus.lock.json');
  if (check) {
    if ((await readFile(target, 'utf8')) !== manifest) throw new Error('Corpus manifest drift');
  } else await writeFile(target, manifest);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = args.find(arg => arg.startsWith('--out='))?.slice(6);
  if (
    args.some(arg => arg !== '--check' && arg !== '--write' && !arg.startsWith('--out=')) ||
    args.includes('--check') === args.includes('--write')
  )
    throw new Error('Use --write OR --check [--out=/absolute/path]');
  await generateCorpus({ ...(out ? { out: resolve(out) } : {}), check: args.includes('--check') });
}
