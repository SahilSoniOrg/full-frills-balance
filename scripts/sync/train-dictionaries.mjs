// Orchestrator only: runs twelve trainers strictly in series. Never invoked by imports.
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dictionaryDir,
  inputs,
  sourceHashes,
  corpusRows,
  corpusBytes,
  pretty,
  sha256,
} from './dictionary-pipeline.mjs';

export async function trainDictionaries({ check = false, zstd = process.env.ZSTD ?? 'zstd' } = {}) {
  const { maps, recipe, tables, mapSha256, recipeSha256 } = await inputs();
  const probe = spawnSync(zstd, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (probe.error?.code === 'ENOENT')
    throw new Error(
      'Dependency missing: install/provide zstd CLI exactly v1.5.7 (ZSTD=/path/to/zstd); no fallback dictionaries',
    );
  if (probe.error || probe.status !== 0 || !/\bv1\.5\.7\b/.test(`${probe.stdout}\n${probe.stderr}`))
    throw new Error('Pinned zstd CLI v1.5.7 required');
  const temporary = await mkdtemp(resolve(tmpdir(), 'ffb-synthetic-dicts-'));
  const artifacts = [];
  try {
    // No corpus input path: ALWAYS rebuild synthetic inputs from the pinned seed.
    for (const [index, table] of tables.entries()) {
      const rows = corpusRows(table, maps[table], recipe);
      const sampleDir = resolve(temporary, table);
      await mkdir(sampleDir);
      const names = [];
      for (const [sample, row] of rows.entries()) {
        const name = `${sample.toString().padStart(6, '0')}.json`;
        await writeFile(resolve(sampleDir, name), JSON.stringify(row.short));
        names.push(name);
      }
      const file = `${table}.v1.bin`,
        output = resolve(temporary, file);
      const zstdDictionaryId = recipe.zstdDictionaryIdBase + index;
      const args = [
        recipe.trainer,
        '-T1',
        `--maxdict=${recipe.dictionaryBytes}`,
        `--dictID=${zstdDictionaryId}`,
        '-q',
        '-o',
        output,
        ...names,
      ];
      const result = spawnSync(zstd, args, {
        cwd: sampleDir,
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, LC_ALL: 'C', LANG: 'C', ZSTD_NBTHREADS: '1' },
      });
      if (result.error || result.status !== 0)
        throw new Error(`Training failed for ${table}: ${result.error?.message ?? result.stderr}`);
      const bytes = await readFile(output);
      if (
        bytes.length < 256 ||
        bytes.length > recipe.dictionaryBytes ||
        bytes.readUInt32LE(0) !== 0xec30a437 ||
        bytes.readUInt32LE(4) !== zstdDictionaryId
      )
        throw new Error(`Trainer produced an invalid dictionary: ${table}`);
      artifacts.push({
        id: `${table}/v1`,
        file,
        bytes: bytes.length,
        zstdDictionaryId,
        sha256: sha256(bytes),
        corpusSha256: sha256(corpusBytes(rows)),
      });
    }
    const lock = pretty({
      formatVersion: 1,
      schemaVersion: 35,
      zstdVersion: recipe.zstdVersion,
      mapSha256,
      recipeSha256,
      sources: await sourceHashes(),
      dictionaries: artifacts,
    });
    // Preflight EVERY target before writing. Existing immutable ids never change.
    const targets = [
      ...artifacts.map(entry => [entry.file, null]),
      ['artifacts.lock.json', Buffer.from(lock)],
    ];
    const writes = [];
    for (const [file, provided] of targets) {
      const expected = provided ?? (await readFile(resolve(temporary, file)));
      const target = resolve(dictionaryDir, file);
      let actual;
      try {
        actual = await readFile(target);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (actual && !actual.equals(expected))
        throw new Error(
          `Immutable dictionary artifact drift: ${file}; add v2 instead of overwriting v1`,
        );
      if (!actual && check) throw new Error(`Missing dictionary artifact: ${file}`);
      if (!actual) writes.push([target, expected]);
    }
    for (const file of await readdir(dictionaryDir))
      if (file.endsWith('.bin') && !artifacts.some(entry => entry.file === file))
        throw new Error(`Unregistered dictionary: ${file}`);
    if (!check)
      for (const [target, bytes] of writes) await writeFile(target, bytes, { flag: 'wx' });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--write', '--check'].includes(args[0]))
    throw new Error('Use --write OR --check; optional ZSTD=/pinned/1.5.7/zstd');
  await trainDictionaries({ check: args[0] === '--check' });
}
