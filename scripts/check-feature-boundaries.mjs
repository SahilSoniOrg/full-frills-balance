#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ALLOWLIST_PATH = path.join(__dirname, 'cross-feature-boundary-allowlist.json');
const SOURCE_FILE_RE = /\.(?:ts|tsx)$/;
const IMPORT_RE = /(?:from\s*|import\s*\()(['"])(@\/src\/features\/([^/'"]+)([^'"]*))\1/g;
export const NEUTRAL_ROOTS = [
  'src/components',
  'src/constants',
  'src/contexts',
  'src/data',
  'src/design-system',
  'src/hooks',
  'src/services',
  'src/types',
  'src/utils',
];

function isExcludedNeutralFixture(relativePath) {
  const segments = relativePath.split('/');
  return (
    segments.some(segment => ['__tests__', '__mocks__', 'fixtures', 'mocks'].includes(segment)) ||
    /\.(?:test|spec)\.(?:ts|tsx)$/.test(relativePath)
  );
}

function walk(directory, visit) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath, visit);
    else if (SOURCE_FILE_RE.test(entry.name)) visit(absolutePath);
  }
}

function getSourceKind(relativePath, neutralRoots) {
  const [, sourceFeature] = relativePath.match(/^src\/features\/([^/]+)\//) ?? [];
  if (sourceFeature) return { type: 'feature', name: sourceFeature };
  if (
    neutralRoots.some(root => relativePath === root || relativePath.startsWith(`${root}/`)) &&
    !isExcludedNeutralFixture(relativePath)
  ) {
    return { type: 'neutral' };
  }
  return null;
}

export function analyzeFeatureBoundaries({
  rootDir = ROOT,
  allowlistPath = path.join(rootDir, 'scripts/cross-feature-boundary-allowlist.json'),
  neutralRoots = NEUTRAL_ROOTS,
} = {}) {
  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  const allowedEdges = new Set(
    Object.entries(allowlist).flatMap(([source, targets]) =>
      targets.map(target => `${source}->${target}`),
    ),
  );
  const actualEdges = new Set();
  const violations = [];
  const scanFile = absolutePath => {
    const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
    const sourceKind = getSourceKind(relativePath, neutralRoots);
    if (!sourceKind) return;
    const source = fs.readFileSync(absolutePath, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const [, , specifier, targetFeature, suffix] = match;
      if (sourceKind.type === 'neutral') {
        violations.push(`${relativePath}: production-neutral module cannot import feature ${specifier}`);
        continue;
      }
      if (targetFeature === sourceKind.name) continue;
      const edge = `${sourceKind.name}->${targetFeature}`;
      if (suffix !== '') {
        violations.push(`${relativePath}: deep cross-feature import ${specifier}`);
        continue;
      }
      actualEdges.add(edge);
      if (!allowedEdges.has(edge)) {
        violations.push(`${relativePath}: unapproved cross-feature dependency ${edge}`);
      }
    }
  };
  walk(path.join(rootDir, 'src/features'), scanFile);
  for (const neutralRoot of neutralRoots) walk(path.join(rootDir, neutralRoot), scanFile);
  for (const edge of allowedEdges) {
    if (!actualEdges.has(edge)) {
      violations.push(`stale allowlist entry ${edge}; remove it so the dependency cannot return`);
    }
  }
  return { actualEdges, allowedEdges, violations };
}

function runCli() {
  const { actualEdges, violations } = analyzeFeatureBoundaries();
  if (violations.length > 0) {
    console.error(`Feature-boundary check FAILED:\n  ${violations.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Feature-boundary check OK: ${actualEdges.size} explicit public-barrel edges; no deep imports.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
