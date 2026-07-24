/**
 * Migration regression harness (Phase 3.3).
 *
 * Uses the same LokiJS adapter as integration tests (`jest.setup.js` → `adapter.ts`).
 *
 * Current strategy: boot a fresh database at the app schema (v28), assert the
 * persisted Loki schema version and table layout match `schema.ts`, then run a
 * minimal ledger write + balance read to prove core tables work end-to-end.
 *
 * Extending with a v27 → v28 fixture later:
 * 1. Check out the commit immediately before the v28 migration landed.
 * 2. In a one-off script or dev build, populate representative rows (accounts,
 *    journals, transactions) and export the Loki DB (adapter `_driver` /
 *    `testClone` serialization, or a documented export helper).
 * 3. Save the export under `src/data/database/__tests__/fixtures/loki-v27.json`.
 * 4. Add a test that constructs a `LokiJSAdapter` with `schema` at v27,
 *    loads the fixture, then swaps to the current `schema` + `migrations` and
 *    calls `setUp()` / opens the DB so Watermelon runs migrations to v28.
 * 5. Assert row counts, spot-check migrated columns, and re-run the journal +
 *    balance smoke below on migrated data.
 */

import type { AppSchema } from '@nozbe/watermelondb';
import { database } from '@/src/data/database/Database';
import { schema } from '@/src/data/database/schema';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { ledgerWriteService } from '@/src/services/ledger';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { foldBalances } from '@/src/services/accounting/BalanceEffects';
import { AccountId, WorkplaceId } from '@/src/types/domain';

const LOKI_SCHEMA_VERSION_KEY = '_loki_schema_version';
const EXPECTED_SCHEMA_VERSION = 28;

function assertSchemaStructureMatches(actual: AppSchema, expected: AppSchema): void {
  expect(actual.version).toBe(expected.version);
  expect(Object.keys(actual.tables).sort()).toEqual(Object.keys(expected.tables).sort());

  for (const tableName of Object.keys(expected.tables)) {
    const expectedColumns = expected.tables[tableName].columnArray.map(c => c.name).sort();
    const actualColumns = actual.tables[tableName].columnArray.map(c => c.name).sort();
    expect(actualColumns).toEqual(expectedColumns);
  }
}

describe('database migrations (LokiJS)', () => {
  const workplaceId = 'wp-migration-test' as WorkplaceId;

  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  }, 30000);

  afterAll(() => {
    rebuildQueueService.stop();
  });

  it('boots at the current schema version', () => {
    expect(schema.version).toBe(EXPECTED_SCHEMA_VERSION);
    expect(database.schema.version).toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('after unsafeResetDatabase, persisted schema matches schema.ts', async () => {
    assertSchemaStructureMatches(database.schema, schema);

    const persistedVersion = await database.adapter.getLocal(LOKI_SCHEMA_VERSION_KEY);
    expect(Number(persistedVersion)).toBe(EXPECTED_SCHEMA_VERSION);
  });

  it('supports journal + transaction writes and balance fold after reset', async () => {
    const cash = await accountRepository.create({
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const expense = await accountRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId,
    });

    await ledgerWriteService.createJournal(
      {
        description: 'Migration smoke expense',
        journalDate: Date.UTC(2024, 0, 15, 12, 0, 0),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: cash.id as AccountId,
            amount: 40,
            transactionType: TransactionType.CREDIT,
          },
          {
            accountId: expense.id as AccountId,
            amount: 40,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceId,
    );

    await rebuildQueueService.flush();

    const cashTransactions = await transactionRepository.findByAccount(
      workplaceId,
      cash.id as AccountId,
    );
    expect(cashTransactions).toHaveLength(1);
    const { final: foldedCashBalance } = foldBalances(0, [
      {
        amount: cashTransactions[0].amount,
        accountType: AccountType.ASSET,
        transactionType: cashTransactions[0].transactionType,
      },
    ]);
    expect(foldedCashBalance).toBe(-40);

    const cashBalance = await balanceService.getAccountBalance(cash.id as AccountId, workplaceId);
    expect(cashBalance.balance).toBe(-40);

    const expenseBalance = await balanceService.getAccountBalance(
      expense.id as AccountId,
      workplaceId,
    );
    expect(expenseBalance.balance).toBe(40);
  });
});
