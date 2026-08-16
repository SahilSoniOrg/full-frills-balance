#!/usr/bin/env node
/**
 * Ratchets feature-to-feature dependencies to the explicit public-barrel edges
 * that exist today. Deep imports are never allowed. Removing an edge requires
 * removing it from the allowlist, so deleted coupling cannot silently return.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FEATURES_ROOT = path.join(ROOT, 'src/features');
const ALLOWLIST_PATH = path.join(__dirname, 'cross-feature-boundary-allowlist.json');
const SOURCE_FILE_RE = /\.(?:ts|tsx)$/;
const IMPORT_RE = /(?:from\s*|import\s*\()(['"])(@\/src\/features\/([^/'"]+)([^'"]*))\1/g;

const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
const allowedEdges = new Set(
  Object.entries(allowlist).flatMap(([source, targets]) =>
    targets.map(target => `${source}->${target}`),
  ),
);
const actualEdges = new Set();
const violations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath);
      continue;
    }
    if (!SOURCE_FILE_RE.test(entry.name)) continue;

    const relativePath = path.relative(ROOT, absolutePath).split(path.sep).join('/');
    const [, sourceFeature] = relativePath.match(/^src\/features\/([^/]+)\//) ?? [];
    if (!sourceFeature) continue;

    const source = fs.readFileSync(absolutePath, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const [, , specifier, targetFeature, suffix] = match;
      if (targetFeature === sourceFeature) continue;

      const edge = `${sourceFeature}->${targetFeature}`;
      if (suffix !== '') {
        violations.push(`${relativePath}: deep cross-feature import ${specifier}`);
        continue;
      }

      actualEdges.add(edge);
      if (!allowedEdges.has(edge)) {
        violations.push(`${relativePath}: unapproved cross-feature dependency ${edge}`);
      }
    }
  }
}

walk(FEATURES_ROOT);

for (const edge of allowedEdges) {
  if (!actualEdges.has(edge)) {
    violations.push(`stale allowlist entry ${edge}; remove it so the dependency cannot return`);
  }
}

if (violations.length > 0) {
  console.error(`Feature-boundary check FAILED:\n  ${violations.join('\n  ')}`);
  process.exit(1);
}

console.log(
  `Feature-boundary check OK: ${actualEdges.size} explicit public-barrel edges; no deep imports.`,
);
