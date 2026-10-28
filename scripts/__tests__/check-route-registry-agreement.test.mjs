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
      const direct = { name: '(tabs)', presentation: 'tab' };
      const ignoredFallbackName = { name: 'accounts' };
      const tuple = ['reports-v2', 'Reports', 'reports', 'financial_reporting_v2'];
      const multiline = [
        'account-management',
        'account',
        'account_reorganization',
        true,
        { name: 'accounts' },
      ];
    `,
  );

  assert.deepEqual(getManifestRouteNames(temporaryManifest), [
    '(tabs)',
    'account-management',
    'reports-v2',
  ]);
});

test('includes primaryPages.ts leaf routes as (tabs) names', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'route-primary-'));
  const temporaryManifest = path.join(temporaryDirectory, 'routeManifest.ts');
  fs.writeFileSync(temporaryManifest, `const direct = { name: '(tabs)', presentation: 'tab' };`);
  fs.writeFileSync(
    path.join(temporaryDirectory, 'primaryPages.ts'),
    `
      export const PRIMARY_PAGES = [
        { routeName: 'index' },
        { routeName: 'accounts' },
        { routeName: 'categories' },
        { routeName: 'commitments' },
        { routeName: 'planned-payments' },
        { routeName: 'activity' },
      ];
    `,
  );

  assert.deepEqual(getManifestRouteNames(temporaryManifest), [
    '(tabs)',
    '(tabs)/accounts',
    '(tabs)/activity',
    '(tabs)/categories',
    '(tabs)/commitments',
    '(tabs)/index',
    '(tabs)/planned-payments',
    'index',
  ]);
});
