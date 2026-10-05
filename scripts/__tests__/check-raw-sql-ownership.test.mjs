import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { collectRawSqlOwnershipFindings } from '../check-raw-sql-ownership.mjs';
import { createTempFixtureRoot } from './temp-fixture.mjs';

function fixtureRoot(t) {
  const root = createTempFixtureRoot(t, 'raw-sql-ownership-');
  fs.mkdirSync(path.join(root, 'src/data/repositories/raw'), { recursive: true });
  return root;
}

test('allows raw SQL calls in the adapter boundary', t => {
  const root = fixtureRoot(t);
  fs.writeFileSync(
    path.join(root, 'src/data/repositories/raw/RawSqlExecutor.ts'),
    'adapter.queryRaw(sql, args);\n',
  );
  fs.writeFileSync(
    path.join(root, 'src/data/repositories/metrics.ts'),
    'rawSqlExecutor.query(sql, args);\n',
  );

  assert.deepEqual(collectRawSqlOwnershipFindings(root), []);
});

test('rejects direct raw calls and imports of the removed facade', t => {
  const root = fixtureRoot(t);
  fs.mkdirSync(path.join(root, 'src/services'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/services/metrics.ts'),
    [
      "import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';",
      'database.adapter.underlyingAdapter._dispatcher._db.unsafeQueryRaw(sql, args);',
      "adapter['queryRaw'](sql, args);",
    ].join('\n'),
  );

  const findings = collectRawSqlOwnershipFindings(root);
  assert.equal(findings.length, 3);
  assert.ok(findings.some(finding => /removed TransactionRawRepository/i.test(finding.message)));
  assert.ok(findings.some(finding => finding.message.includes('unsafeQueryRaw')));
  assert.ok(findings.some(finding => finding.message.includes('queryRaw')));
});

test('ignores tests so SQL contract tests can inspect the executor boundary', t => {
  const root = fixtureRoot(t);
  fs.mkdirSync(path.join(root, 'src/data/repositories/__tests__'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/data/repositories/__tests__/raw.test.ts'),
    'adapter.queryRaw(sql, args);\n',
  );

  assert.deepEqual(collectRawSqlOwnershipFindings(root), []);
});

test('rejects restoration of the removed broad facade file', t => {
  const root = fixtureRoot(t);
  const facadePath = path.join(root, 'src/data/repositories/TransactionRawRepository.ts');
  fs.writeFileSync(facadePath, 'export {}');

  assert.deepEqual(collectRawSqlOwnershipFindings(root), [
    {
      file: 'src/data/repositories/TransactionRawRepository.ts',
      line: 1,
      message: 'Removed TransactionRawRepository facade file has been restored',
    },
  ]);
});
