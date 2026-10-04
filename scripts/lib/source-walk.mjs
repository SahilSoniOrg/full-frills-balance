import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SKIP_DIR_NAMES = new Set(['coverage', 'dist', 'dist-e2e', 'node_modules']);
export const DEFAULT_SOURCE_ROOTS = ['app', 'src'];

export function normalizePath(value) {
  return value.split(path.sep).join('/');
}

export function isProductionSource(relativePath, options = {}) {
  const { excludeMocks = false, excludePrefixes = [], excludeTestHelperFiles = false } = options;
  if (!/\.(?:ts|tsx)$/.test(relativePath)) return false;
  if (relativePath.includes('/__tests__/')) return false;
  if (/(?:\.test|\.spec)\.(?:ts|tsx)$/.test(relativePath)) return false;
  if (excludeMocks && /(?:^|\/)__mocks__\//.test(relativePath)) return false;
  if (excludeTestHelperFiles && /(?:TestHelpers)\.(?:ts|tsx)$/.test(relativePath)) return false;
  if (excludePrefixes.some(prefix => relativePath.startsWith(prefix))) return false;
  return true;
}

export function isDesignSystemUiSource(relativePath) {
  return (
    /\.(?:ts|tsx)$/.test(relativePath) &&
    !relativePath.includes('/__tests__/') &&
    !/(?:^|\/)__mocks__\//.test(relativePath) &&
    !/(?:^|\/)(?:test|spec)\.(?:ts|tsx)$/.test(relativePath)
  );
}

export function walkProductionSources(root, options = {}) {
  const {
    sourceRoots = DEFAULT_SOURCE_ROOTS,
    sort = false,
    isSource = relativePath => isProductionSource(relativePath, options),
  } = options;
  const files = [];
  const walk = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (DEFAULT_SKIP_DIR_NAMES.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else {
        const relativePath = normalizePath(path.relative(root, absolutePath));
        if (isSource(relativePath)) files.push({ absolutePath, relativePath });
      }
    }
  };
  for (const sourceRoot of sourceRoots) walk(path.join(root, sourceRoot));
  if (sort) files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}
