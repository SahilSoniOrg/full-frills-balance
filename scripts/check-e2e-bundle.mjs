#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const outputDir = process.argv[2];
const markers = ['__FFB_E2E_DESTRUCTIVE_BOOTSTRAP__', '__FFB_JS_KEY_CRYPTO_TEST_ONLY__'];

if (!outputDir) {
  console.error('Usage: node scripts/check-e2e-bundle.mjs <export-directory>');
  process.exit(2);
}

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.hbc')) files.push(absolutePath);
  }
}

walk(outputDir);
const matches = files.filter(file =>
  markers.some(marker => fs.readFileSync(file, 'utf8').includes(marker)),
);

if (matches.length > 0) {
  console.error(
    `Production bundle contains a destructive/test-only crypto marker:\n${matches.join('\n')}`,
  );
  process.exit(1);
}

console.log(`Production E2E bundle check OK: scanned ${files.length} JavaScript files.`);
