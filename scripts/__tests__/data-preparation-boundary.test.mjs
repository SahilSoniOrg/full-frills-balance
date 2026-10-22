import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { dataPreparationViolations, resolveLocal } from '../lib/data-preparation-boundary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('pure boundary loads and validates plain data without platform mocks or runtime initialization', () => {
  const loaded = new Map();
  function load(filename) {
    if (loaded.has(filename)) return loaded.get(filename).exports;
    const module = { exports: {} };
    loaded.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = target => {
      const candidates = resolveLocal(root, filename, target);
      assert.ok(candidates?.length, `Unexpected external/runtime dependency: ${target}`);
      const next = candidates[0];
      assert.doesNotMatch(next, /\/data\/|\/preferences|\/backup\/|react|native|expo-key-crypto/);
      return load(next);
    };
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
    return module.exports;
  }
  const preparation = load(path.join(root, 'src/services/sync/rowPreparation.ts'));
  const validation = load(path.join(root, 'src/services/sync/workplaceRowValidation.ts'));
  const fixture = createRequire(import.meta.url)(
    '../../src/services/sync/__tests__/fixtures/dataPreparation.v1.json',
  );
  const metadata = preparation.prepareWorkplaceMetadata(fixture.input.workplace, 30, { USD: 2 });
  assert.equal(validation.validateWorkplaceRows([metadata], fixture.input.workplace.id).length, 1);
  assert.equal(validation.rowImportData([metadata]).accounts.length, 0);
  assert.throws(() => validation.validateWorkplaceRows([], fixture.input.workplace.id));
});

test('architecture guard catches transitive persistence, native variants and type-only runtime models', t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-preparation-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  function write(name, text) {
    const filename = path.join(fixtureRoot, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, text);
  }
  write(
    'src/root.ts',
    "import './helper'; import type Account from './data/models/Account'; import type { ReactNode } from 'react';",
  );
  write('src/helper.ts', 'export const x = 1;');
  write('src/helper.native.ts', "import './data/repositories/store';");
  write('src/data/models/Account.ts', 'export default class Account {}');
  write('src/data/repositories/store.ts', 'export const store = {};');
  const violations = dataPreparationViolations(fixtureRoot, ['src/root.ts']);
  assert.equal(violations.length, 3);
  assert.ok(violations.some(line => line.includes('models/Account')));
  assert.ok(violations.some(line => line.includes('react')));
  assert.ok(violations.some(line => line.includes('repositories/store')));
});
