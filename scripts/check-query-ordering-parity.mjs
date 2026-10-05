import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkDirectory } from './lib/source-walk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER_TERM_PATTERN = /(?:[A-Za-z_][\w]*\.)?([A-Za-z_][\w]*)\s+(ASC|DESC)/gi;
const SORT_BY_PATTERN = /Q\.sortBy\(\s*['"]([^'"]+)['"]\s*,\s*Q\.(asc|desc)\s*\)/gi;

function normalizeTerms(terms) {
  return terms.map(([field, direction]) => `${field.toLowerCase()}:${direction.toLowerCase()}`);
}

function extractRawOrdering(source) {
  return [...source.matchAll(/ORDER\s+BY\s+([^;\n`]+)/gi)]
    .map(match => normalizeTerms([...match[1].matchAll(ORDER_TERM_PATTERN)].map(term => [term[1], term[2]])))
    .filter(terms => terms.some(term => term.startsWith('transaction_date:')));
}

function extractOrmOrdering(source) {
  return normalizeTerms(
    [...source.matchAll(SORT_BY_PATTERN)].map(match => [match[1], match[2]]),
  );
}

function hasConsecutiveSequence(haystack, needle) {
  return haystack.some((_, index) =>
    needle.every((term, offset) => haystack[index + offset] === term),
  );
}

export function collectQueryOrderingParityFindings(root = ROOT) {
  const rawDirectory = path.join(root, 'src/data/repositories/raw');
  const findings = [];
  if (!fs.existsSync(rawDirectory)) return findings;

  walkDirectory(rawDirectory, absolutePath => {
    const entryName = path.basename(absolutePath);
    if (!entryName.endsWith('.ts') || entryName.includes('.test.')) return;
    const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
    const source = fs.readFileSync(absolutePath, 'utf8');
    const rawOrderings = extractRawOrdering(source);
    if (rawOrderings.length === 0) return;
    const ormOrdering = extractOrmOrdering(source);

    for (const expected of rawOrderings) {
      if (!hasConsecutiveSequence(ormOrdering, expected)) {
        findings.push({
          file: relativePath,
          message: `ORM sortBy ordering does not match raw SQL ORDER BY: ${expected.join(', ')}`,
        });
      }
    }
  });

  return findings.sort((left, right) => left.file.localeCompare(right.file));
}

function run() {
  const findings = collectQueryOrderingParityFindings();
  if (findings.length > 0) {
    console.error('Query ordering parity FAILED:');
    for (const finding of findings) console.error(`${finding.file}: ${finding.message}`);
    process.exitCode = 1;
    return;
  }
  console.log('Query ordering parity passed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
