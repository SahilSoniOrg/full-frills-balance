#!/usr/bin/env node
/**
 * Report-only monitor for raw React Native primitives in product UI.
 *
 * This intentionally does not fail CI. It makes migration progress visible
 * without pretending that every existing View/Text import can be changed safely
 * in one pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDesignSystemUiSource, walkProductionSources } from './lib/source-walk.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(SCRIPT_DIR, '..');
const SOURCE_ROOTS = ['app', 'src/components', 'src/features'];
const PRIMITIVES = ['View', 'Text'];

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') args.root = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return args;
}

function collectFiles(root) {
  return walkProductionSources(root, {
    sourceRoots: SOURCE_ROOTS,
    sort: true,
    isSource: isDesignSystemUiSource,
  });
}

function importedPrimitives(source) {
  const found = new Set();
  const importPattern = /import\s*{([\s\S]*?)}\s*from\s*['"]react-native['"]/g;

  for (const match of source.matchAll(importPattern)) {
    for (const specifier of match[1].split(',')) {
      const importedName = specifier.trim().split(/\s+as\s+/)[0];
      if (PRIMITIVES.includes(importedName)) found.add(importedName);
    }
  }

  return [...found];
}

export function collectPrimitiveUsage(root = DEFAULT_ROOT) {
  const scanned = collectFiles(root);
  const files = scanned.flatMap(file => {
    const primitives = importedPrimitives(fs.readFileSync(file.absolutePath, 'utf8'));
    return primitives.length > 0 ? [{ file: file.relativePath, primitives }] : [];
  });
  const counts = Object.fromEntries(
    PRIMITIVES.map(primitive => [
      primitive,
      {
        files: files.filter(file => file.primitives.includes(primitive)).length,
        imports: files.filter(file => file.primitives.includes(primitive)).length,
      },
    ]),
  );

  return { files, filesScanned: scanned.length, counts };
}

export function formatReport(report) {
  const lines = [
    'Design-system primitive monitor (report-only):',
    `  scanned ${report.filesScanned} production UI files`,
  ];
  for (const primitive of PRIMITIVES) {
    lines.push(
      `  raw ${primitive}: ${report.counts[primitive].files} files (${report.counts[primitive].imports} imports)`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function run() {
  const { root } = parseArgs(process.argv.slice(2));
  process.stdout.write(formatReport(collectPrimitiveUsage(root)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
