import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectRouteFiles(directory, prefix = '') {
  const routes = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      routes.push(...collectRouteFiles(absolutePath, relativePath));
      if (fs.existsSync(path.join(absolutePath, '_layout.tsx')) && relativePath) {
        routes.push(relativePath.split(path.sep).join('/'));
      }
      continue;
    }
    if (!/\.(?:tsx?|jsx?)$/.test(entry.name)) continue;
    const routePath = relativePath.replace(/\.(?:tsx?|jsx?)$/, '').split(path.sep).join('/');
    if (routePath === '_layout' || routePath.endsWith('/_layout')) continue;
    routes.push(routePath);
  }
  return routes.sort();
}

export function getAppRouteNames(appDirectory) {
  return collectRouteFiles(appDirectory);
}

export function getManifestRouteNames(manifestPath) {
  const source = fs.readFileSync(manifestPath, 'utf8');
  const names = new Set();

  for (const match of source.matchAll(/\bname:\s*['"]([^'"]+)['"]/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/(?:^|=\s*)\s*\[['"]([^'"]+)['"],/gm)) {
    names.add(match[1]);
  }

  return [...names].sort();
}

export function findRouteRegistryMismatches(appRoutes, manifestRoutes) {
  const manifest = new Set(manifestRoutes);
  const app = new Set(appRoutes);
  return {
    missingFromManifest: appRoutes.filter(route => !manifest.has(route)),
    missingFromApp: manifestRoutes.filter(route => !app.has(route)),
  };
}

export function checkRouteRegistryAgreement({
  appDirectory = path.join(ROOT, 'app'),
  manifestPath = path.join(ROOT, 'src/navigation/routeManifest.ts'),
} = {}) {
  const appRoutes = getAppRouteNames(appDirectory);
  const manifestRoutes = getManifestRouteNames(manifestPath);
  const mismatches = findRouteRegistryMismatches(appRoutes, manifestRoutes);
  return { appRoutes, manifestRoutes, ...mismatches };
}

function run() {
  const result = checkRouteRegistryAgreement();
  if (result.missingFromManifest.length || result.missingFromApp.length) {
    console.error('Route registry agreement FAILED:');
    if (result.missingFromManifest.length) {
      console.error(`Missing from routeManifest.ts: ${result.missingFromManifest.join(', ')}`);
    }
    if (result.missingFromApp.length) {
      console.error(`Missing from app/: ${result.missingFromApp.join(', ')}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Route registry agreement passed (${result.appRoutes.length} routes).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
