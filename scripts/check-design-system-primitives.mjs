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

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(SCRIPT_DIR, '..');
const SOURCE_ROOTS = ['app', 'src/components', 'src/features'];
const PRIMITIVES = ['View', 'Text'];
const SOURCE_FILE_RE = /\.(?:ts|tsx)$/;

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') args.root = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return args;
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function isProductionSource(relativePath) {
  return (
    SOURCE_FILE_RE.test(relativePath) &&
    !relativePath.includes('/__tests__/') &&
    !/(?:^|\/)__mocks__\//.test(relativePath) &&
    !/(?:^|\/)(?:test|spec)\.(?:ts|tsx)$/.test(relativePath)
  );
}

function collectFiles(root) {
  const files = [];
  const walk = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['coverage', 'dist', 'dist-e2e', 'node_modules'].includes(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else {
        const relativePath = normalizePath(path.relative(root, absolutePath));
        if (isProductionSource(relativePath)) files.push({ absolutePath, relativePath });
      }
    }
  };

  for (const sourceRoot of SOURCE_ROOTS) walk(path.join(root, sourceRoot));
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
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
  const files = collectFiles(root).flatMap(file => {
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

  return { files, filesScanned: collectFiles(root).length, counts };
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
