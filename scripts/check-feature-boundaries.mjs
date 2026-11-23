#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { walkDirectory } from './lib/source-walk.mjs';
import { analyzeDomainBoundaries } from './lib/domain-boundaries.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SOURCE_FILE_RE = /\.(?:ts|tsx)$/;
// `from\s*` keeps valid `from'...'` syntax; `\s*` after `import(` catches
// multiline dynamic imports that would otherwise slip past the boundary check.
const IMPORT_RE = /(?:from\s*|import\s*\(\s*)(['"])([^'"]+)\1/g;
export const NEUTRAL_ROOTS = [
  'src/components',
  'src/constants',
  'src/contexts',
  'src/data',
  'src/design-system',
  'src/domain',
  'src/navigation',
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
  walkDirectory(directory, absolutePath => {
    if (SOURCE_FILE_RE.test(path.basename(absolutePath))) visit(absolutePath);
  });
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

function resolveImportPath(rootDir, importerPath, specifier) {
  if (specifier.startsWith('@/')) {
    return path.resolve(rootDir, specifier.slice(2));
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(importerPath), specifier);
  }
  return null;
}

function resolveFeatureImport(rootDir, importerPath, specifier) {
  const resolved = resolveImportPath(rootDir, importerPath, specifier);
  if (!resolved) return null;

  const featuresRoot = path.resolve(rootDir, 'src/features');
  const relativeToFeatures = path.relative(featuresRoot, resolved);
  if (relativeToFeatures.startsWith('..') || path.isAbsolute(relativeToFeatures)) return null;

  const [targetFeature, ...suffix] = relativeToFeatures.split(path.sep);
  if (!targetFeature) return null;
  return { targetFeature, isDeep: suffix.length > 0, isRelative: specifier.startsWith('.') };
}

/** Feature → repository imports, including relative paths that bypass the @/ alias ban. */
function resolveRepositoryImport(rootDir, importerPath, specifier) {
  const resolved = resolveImportPath(rootDir, importerPath, specifier);
  if (!resolved) return null;
  const repositoriesRoot = path.resolve(rootDir, 'src/data/repositories');
  const relative = path.relative(repositoriesRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return { specifier, isRelative: specifier.startsWith('.') };
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
      const [, , specifier] = match;
      if (sourceKind.type === 'feature' && !isExcludedNeutralFixture(relativePath)) {
        const repositoryImport = resolveRepositoryImport(rootDir, absolutePath, specifier);
        if (repositoryImport) {
          violations.push(
            `${relativePath}: feature must not import data repository ${specifier}; use a service façade instead`,
          );
          continue;
        }
      }
      const importedFeature = resolveFeatureImport(rootDir, absolutePath, specifier);
      if (!importedFeature) continue;
      const { targetFeature, isDeep, isRelative } = importedFeature;
      if (sourceKind.type === 'neutral') {
        violations.push(
          `${relativePath}: production-neutral module cannot import feature ${specifier}`,
        );
        continue;
      }
      if (targetFeature === sourceKind.name) continue;
      const edge = `${sourceKind.name}->${targetFeature}`;
      if (isRelative) {
        violations.push(`${relativePath}: relative cross-feature import ${specifier}`);
        continue;
      }
      if (isDeep) {
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
  const domain = analyzeDomainBoundaries({ rootDir });
  violations.push(...domain.violations);
  return { actualEdges, allowedEdges, violations, domainModuleCount: domain.domainModuleCount };
}

function runCli() {
  const { actualEdges, violations, domainModuleCount } = analyzeFeatureBoundaries();
  if (violations.length > 0) {
    console.error(`Feature/domain boundary check FAILED:\n  ${violations.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Feature/domain boundary check OK: ${actualEdges.size} public-barrel edges; ${domainModuleCount} domain modules have no forbidden direct or indirect runtime dependencies.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
