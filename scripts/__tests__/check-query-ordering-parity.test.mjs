import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectQueryOrderingParityFindings } from '../check-query-ordering-parity.mjs';

function fixtureRoot(t, source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'query-ordering-parity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'src/data/repositories/raw');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'FixtureQueries.ts'), source);
  return root;
}

test('accepts matching SQL and ORM tie-breakers', t => {
  const root = fixtureRoot(
    t,
    `
      const sql = 'ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC';
      query(Q.sortBy('transaction_date', Q.desc), Q.sortBy('created_at', Q.desc), Q.sortBy('id', Q.desc));
    `,
  );

  assert.deepEqual(collectQueryOrderingParityFindings(root), []);
});

test('rejects a missing ORM id tie-breaker', t => {
  const root = fixtureRoot(
    t,
    `
      const sql = 'ORDER BY t.transaction_date ASC, t.created_at ASC, t.id ASC';
      query(Q.sortBy('transaction_date', Q.asc), Q.sortBy('created_at', Q.asc));
    `,
  );

  assert.equal(collectQueryOrderingParityFindings(root).length, 1);
});
