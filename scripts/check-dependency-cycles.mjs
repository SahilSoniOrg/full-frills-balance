import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'dependency-cycle-baseline.json');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function isProductionSource(filePath) {
  return SOURCE_EXTENSIONS.includes(path.extname(filePath)) &&
    !filePath.split(path.sep).includes('__tests__') &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.test.tsx');
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(entryPath));
    else if (isProductionSource(entryPath)) files.push(entryPath);
  }
  return files;
}

function resolveImport(importer, specifier) {
  if (specifier.startsWith('@/')) return resolveFile(path.join(ROOT, specifier.slice(2)));
  if (specifier.startsWith('.')) return resolveFile(path.resolve(path.dirname(importer), specifier));
  return null;
}

function resolveFile(candidate) {
  const candidates = [candidate, ...SOURCE_EXTENSIONS.map(ext => `${candidate}${ext}`), ...SOURCE_EXTENSIONS.map(ext => path.join(candidate, `index${ext}`))];
  return candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile()) ?? null;
}

function parseDependencies(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const specifiers = new Set();
  const importPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(importPattern)) specifiers.add(match[1]);
  for (const match of source.matchAll(dynamicImportPattern)) specifiers.add(match[1]);
  return [...specifiers].map(specifier => resolveImport(filePath, specifier)).filter(Boolean);
}

function stronglyConnectedComponents(graph) {
  let index = 0;
  const stack = [];
  const indices = new Map();
  const lowLinks = new Map();
  const onStack = new Set();
  const components = [];

  function visit(node) {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const dependency of graph.get(node) ?? []) {
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
      } else if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(dependency)));
      }
    }

    if (lowLinks.get(node) === indices.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) components.push(component.sort());
    }
  }

  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return components;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

const files = collectFiles(SRC_ROOT);
const graph = new Map(files.map(file => [file, parseDependencies(file)]));
const actualCycles = stronglyConnectedComponents(graph).map(component => component.map(relative));
const actualKeys = new Set(actualCycles.map(cycle => cycle.join('|')));
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const baselineKeys = new Set(baseline.cycles.map(cycle => cycle.join('|')));
const additions = actualCycles.filter(cycle => !baselineKeys.has(cycle.join('|')));
const stale = baseline.cycles.filter(cycle => !actualKeys.has(cycle.join('|')));

if (additions.length || stale.length) {
  if (additions.length) console.error(`New dependency cycles:\n${additions.map(cycle => `  ${cycle.join(' -> ')}`).join('\n')}`);
  if (stale.length) console.error(`Stale dependency-cycle baseline entries:\n${stale.map(cycle => `  ${cycle.join(' -> ')}`).join('\n')}`);
  process.exit(1);
}

console.log(`Dependency-cycle guard OK: ${actualCycles.length} baseline cycle(s), ${files.length} production files scanned.`);
