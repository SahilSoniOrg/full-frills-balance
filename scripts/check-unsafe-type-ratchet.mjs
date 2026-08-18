#!/usr/bin/env node
/**
 * Ratchet: production unsafe-type usage must not exceed the committed baseline.
 * See docs/CONVENTIONS.md § Architecture guardrails.
 *
 * Usage:
 *   node scripts/check-unsafe-type-ratchet.mjs          # fail if count > baseline
 *   node scripts/check-unsafe-type-ratchet.mjs --update # refresh baseline (intentional decreases only)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'unsafe-type-baseline.json');

const SCAN_ROOTS = ['src', 'app'];
const SKIP_DIR_NAMES = new Set([
  '__tests__',
  'node_modules',
  'dist',
  'dist-e2e',
  'coverage',
]);
const SKIP_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;

/** Each match increments the budget by one (line may contribute multiple). */
const PATTERNS = [
  { id: 'annotation_any', re: /:\s*any\b/g },
  { id: 'as_any', re: /\bas\s+any\b/g },
  { id: 'ts_ignore', re: /@ts-(?:ignore|expect-error)\b/g },
  { id: 'double_cast', re: /\bas\s+unknown\s+as\b/g },
];

function isProductionSource(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) return false;
  if (SKIP_FILE_RE.test(rel)) return false;
  const parts = rel.split(path.sep);
  if (parts.some(p => SKIP_DIR_NAMES.has(p))) return false;
  return true;
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      if (SKIP_DIR_NAMES.has(name)) continue;
      walk(abs, out);
      continue;
    }
    if (isProductionSource(abs)) out.push(abs);
  }
}

function countFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const byPattern = Object.fromEntries(PATTERNS.map(p => [p.id, 0]));
  let total = 0;
  for (const { id, re } of PATTERNS) {
    const matches = text.match(re);
    const n = matches ? matches.length : 0;
    byPattern[id] = n;
    total += n;
  }
  return { total, byPattern };
}

function collect() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    walk(path.join(ROOT, root), files);
  }
  const byPattern = Object.fromEntries(PATTERNS.map(p => [p.id, 0]));
  const filesWithHits = [];
  let total = 0;
  for (const file of files) {
    const { total: t, byPattern: bp } = countFile(file);
    total += t;
    for (const [id, n] of Object.entries(bp)) {
      byPattern[id] += n;
    }
    if (t > 0) filesWithHits.push(path.relative(ROOT, file));
  }
  return { total, byPattern, fileCount: files.length, filesWithHits };
}

function unmatchedOwnerFiles(filesWithHits, ownersByPrefix) {
  const prefixes = Object.keys(ownersByPrefix || {});
  return filesWithHits.filter(rel => !prefixes.some(prefix => rel.startsWith(prefix)));
}

const update = process.argv.includes('--update');
const snapshot = collect();

if (update) {
  const previous = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  const payload = {
    description:
      'Maximum allowed unsafe-type occurrences in production src/app (excludes tests). Decrease only via --update after cleanup.',
    scannedAt: new Date().toISOString().slice(0, 10),
    fileCount: snapshot.fileCount,
    total: snapshot.total,
    byPattern: snapshot.byPattern,
    ownersByPrefix: previous.ownersByPrefix || {},
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Updated baseline: total=${snapshot.total}`, snapshot.byPattern);
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`Missing ${BASELINE_PATH}. Run with --update to create the baseline.`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const limit = baseline.total;

if (snapshot.total > limit) {
  console.error(
    `Unsafe-type ratchet FAILED: ${snapshot.total} occurrences (baseline ${limit}). ` +
      `Breakdown now: ${JSON.stringify(snapshot.byPattern)} vs baseline ${JSON.stringify(baseline.byPattern)}. ` +
      'Remove unsafe types or do not add new ones.',
  );
  process.exit(1);
}

const unmatched = unmatchedOwnerFiles(snapshot.filesWithHits, baseline.ownersByPrefix);
if (!baseline.ownersByPrefix || Object.keys(baseline.ownersByPrefix).length === 0) {
  console.error(
    'Unsafe-type ratchet FAILED: scripts/unsafe-type-baseline.json is missing ownersByPrefix.',
  );
  process.exit(1);
}
if (unmatched.length > 0) {
  console.error(
    'Unsafe-type ratchet FAILED: files with unsafe types lack a named owner prefix:\n  ' +
      unmatched.join('\n  ') +
      '\nAdd a ownersByPrefix entry in scripts/unsafe-type-baseline.json.',
  );
  process.exit(1);
}

console.log(
  `Unsafe-type ratchet OK: ${snapshot.total}/${limit} (${snapshot.fileCount} production files scanned; ${snapshot.filesWithHits.length} owned files).`,
);
process.exit(0);
