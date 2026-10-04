import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  findRouteRegistryMismatches,
  getAppRouteNames,
  getManifestRouteNames,
} from '../check-route-registry-agreement.mjs';

test('maps route files and manifest entries without layouts', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'route-registry-'));
  fs.mkdirSync(path.join(temporaryDirectory, '(tabs)'), { recursive: true });
  fs.writeFileSync(path.join(temporaryDirectory, 'index.tsx'), '');
  fs.writeFileSync(path.join(temporaryDirectory, '(tabs)', '_layout.tsx'), '');
  fs.writeFileSync(path.join(temporaryDirectory, '(tabs)', 'accounts.tsx'), '');

  const routes = getAppRouteNames(temporaryDirectory);
  assert.deepEqual(routes, ['(tabs)', '(tabs)/accounts', 'index']);
});

test('reports route agreement mismatches', () => {
  assert.deepEqual(
    findRouteRegistryMismatches(['index', 'reports'], ['index', 'reports-v2']),
    {
      missingFromManifest: ['reports'],
      missingFromApp: ['reports-v2'],
    },
  );
});

test('extracts direct and tuple manifest route names', () => {
  const temporaryManifest = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'route-manifest-')),
    'routeManifest.ts',
  );
  fs.writeFileSync(
    temporaryManifest,
    `
      const direct = { name: '(tabs)' };
      const tuple = ['reports-v2', 'Reports', 'reports', 'financial_reporting_v2'];
    `,
  );

  assert.deepEqual(getManifestRouteNames(temporaryManifest), ['(tabs)', 'reports-v2']);
});
