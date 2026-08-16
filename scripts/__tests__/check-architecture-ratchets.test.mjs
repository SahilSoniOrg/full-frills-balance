import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectArchitectureFindings,
  compareWithBaseline,
} from '../check-architecture-ratchets.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-ratchet-'));
  for (const [relativePath, source] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  return root;
}

function emptyBaseline() {
  return {
    rules: {
      unscoped_raw_query: {},
      presentation_model_import: {},
      direct_database_write: {},
    },
  };
}

test('reports each new violation with an actionable file and line', t => {
  const root = fixture({
    'src/features/accounts/view.ts':
      "import Account from '@/src/data/models/Account';\nexport const value = Account;\n",
    'src/data/repositories/UnsafeQueries.ts':
      'export class UnsafeQueries {\n  async findAllRaw(ids: string[]) { return ids; }\n}\n',
    'src/services/unsafeWrite.ts':
      "import { database as db } from '@/src/data/database/Database';\nexport const save = () => db.write(async () => {});\n",
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const findings = collectArchitectureFindings(root);
  const { failures } = compareWithBaseline(findings, emptyBaseline());

  assert.equal(failures.length, 3);
  assert.ok(failures.every(failure => /^.+:\d+: \[.+\]/.test(failure)));
});

test('detects unscoped static raw SQL and accepts workplace-scoped SQL', t => {
  const root = fixture({
    'src/data/repositories/raw/Queries.ts': `
      export async function unsafe(adapter: any) {
        const sql = \`SELECT * FROM transactions WHERE deleted_at IS NULL\`;
        return adapter.queryRaw(sql, []);
      }
      export async function safe(adapter: any) {
        return adapter.queryRaw(\`SELECT * FROM journals WHERE workplace_id = ?\`, ['wp']);
      }
    `,
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const findings = collectArchitectureFindings(root).filter(
    finding => finding.rule === 'unscoped_raw_query',
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /without a workplace_id predicate/);
});

test('ignores tests and approved persistence seams', t => {
  const root = fixture({
    'src/features/accounts/__tests__/view.test.ts':
      "import Account from '@/src/data/models/Account';\nvoid Account;\n",
    'src/data/repositories/Allowed.ts':
      "import { database } from '@/src/data/database/Database';\nexport const save = () => database.batch([]);\n",
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(collectArchitectureFindings(root), []);
});

test('fails when a baseline entry becomes stale', () => {
  const baseline = emptyBaseline();
  baseline.rules.presentation_model_import['src/features/accounts/view.ts'] = 1;

  const { failures } = compareWithBaseline([], baseline);
  assert.deepEqual(failures, [
    'src/features/accounts/view.ts: [presentation_model_import] stale baseline 1; current count is 0. Reduce the baseline so this debt cannot return.',
  ]);
});
