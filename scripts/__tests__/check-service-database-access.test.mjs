import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve('scripts/check-service-database-access.mjs');

function fixture(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-database-access-'));
  const file = path.join(root, 'src/services/fixture.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return root;
}

test('executable guard fails for direct service database collection access', t => {
  const root = fixture(`
    import { database } from '@/src/data/database/Database';
    const db = database;
    export const records = db.collections.get('transactions');
  `);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, root], { encoding: 'utf8', stdio: 'pipe' }),
    error =>
      error.status === 1 &&
      error.stderr.includes('src/services/fixture.ts:4') &&
      error.stderr.includes('Service database collection access is forbidden'),
  );
});

test('executable guard passes when service code uses a repository', t => {
  const root = fixture(`
    import { transactionQueryRepository } from '@/src/data/repositories/transaction';
    export const records = transactionQueryRepository.findAllNonDeleted('workplace' as never);
  `);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const output = execFileSync(process.execPath, [SCRIPT, root], { encoding: 'utf8' });
  assert.match(output, /guard OK/);
});
