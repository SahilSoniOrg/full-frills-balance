import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { AccountType, TransactionType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

import type { AppSchema } from '@nozbe/watermelondb';
import { database } from '@/src/data/database/Database';
import { schema } from '@/src/data/database/schema';
import { migrations } from '@/src/data/database/migrations';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';

import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { prepareAccountFieldUpdate } from '@/src/services/accounts/accountHierarchyCommands';
import { balanceReadService } from '@/src/services/balance/balanceReadService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { foldBalances } from '@/src/domain/accounting/BalanceEffects';
import { resetDatabase } from '@/src/testing/resetDatabase';

import { runMigrationSqlFixture } from './migrationSqlHarness';

const LOKI_SCHEMA_VERSION_KEY = '_loki_schema_version';
const EXPECTED_SCHEMA_VERSION = 40;

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
  it('upgrades v39 with People tables and the settlement intent date in one v40 migration', () => {
    expect(schema.version).toBe(40);
    for (const table of ['people', 'person_accounts', 'open_items', 'settlement_allocations']) {
      expect(schema.tables[table]).toBeDefined();
    }
    const v40Migration = migrations.sortedMigrations.find(step => step.toVersion === 40);
    expect(v40Migration).toBeDefined();
    expect(v40Migration?.steps.filter(step => step.type === 'create_table')).toHaveLength(4);
    expect(v40Migration?.steps).toContainEqual(
      expect.objectContaining({
        type: 'add_columns',
        table: 'balance_rebuild_intents',
        columns: [
          expect.objectContaining({
            name: 'people_settlement_journal_date',
            type: 'number',
            isOptional: true,
          }),
        ],
      }),
    );

    const result = runMigrationSqlFixture(
      `
create_table('balance_rebuild_intents', payload['balance_rebuild_intent_columns'])
apply_steps(payload['steps'])
db.execute("INSERT INTO people (id, name, notes, color, created_at, updated_at, workplace_id) VALUES ('p1', 'Pri', 'Roommate', '#2563EB', 1, 2, 'wp1')")
db.row_factory = sqlite3.Row
print(json.dumps(dict(
  person=dict(db.execute('SELECT * FROM people').fetchone()),
  intent_columns=[row[1] for row in db.execute('PRAGMA table_info(balance_rebuild_intents)')],
)))
`,
      {
        steps: v40Migration?.steps,
        balance_rebuild_intent_columns: schema.tables.balance_rebuild_intents.columnArray.filter(
          column => column.name !== 'people_settlement_journal_date',
        ),
      },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      person: {
        id: 'p1',
        name: 'Pri',
        notes: 'Roommate',
        icon: null,
        color: '#2563EB',
        default_currency_code: null,
        payment_handle: null,
        phone: null,
        email: null,
        is_pinned: null,
      },
      intent_columns: expect.arrayContaining([
        'account_id',
        'from_date',
        'revision',
        'created_at',
        'updated_at',
        'workplace_id',
        'people_settlement_journal_date',
      ]),
    });
  });

  const workplaceId = 'wp-migration-test' as WorkplaceId;

  beforeEach(async () => {
    await resetDatabase();
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

  it('starts a current-schema install with no Workplace rows', async () => {
    expect(await workplaceRepository.findAll()).toHaveLength(0);
  });

  it('keeps the v23 Personal backfill for legacy upgrades', () => {
    const v23 = migrations.sortedMigrations.find(migration => migration.toVersion === 23);
    const workplaceInsert = v23?.steps.find(
      step => step.type === 'sql' && step.sql.includes('INSERT INTO workplaces'),
    );

    expect(workplaceInsert).toBeDefined();
    expect((workplaceInsert as { sql: string }).sql).toContain("'Personal workplace'");
    expect((workplaceInsert as { sql: string }).sql).toContain(
      'WHERE (SELECT COUNT(*) FROM workplaces) = 0',
    );
  });

  it('supports journal + transaction writes and balance fold after reset', async () => {
    const cash = await accountWriteRepository.create({
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
    });
    const expense = await accountWriteRepository.create({
      name: 'Food',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId,
    });

    await journalPersistenceService.put(
      {
        description: 'Migration smoke expense',
        journalDate: Date.UTC(2024, 0, 15, 12, 0, 0),
        currencyCode: 'USD',
        transactions: [
          {
            accountId: cash.id,
            amount: 40,
            transactionType: TransactionType.CREDIT,
          },
          {
            accountId: expense.id,
            amount: 40,
            transactionType: TransactionType.DEBIT,
          },
        ],
      },
      workplaceId,
    );

    await rebuildQueueService.flush();

    const cashTransactions = await transactionQueryRepository.findByAccountsAndDateRange(
      workplaceId,
      [cash.id],
      0,
      Number.MAX_SAFE_INTEGER,
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

    const cashBalance = await balanceReadService.getAccountBalance(cash.id, workplaceId);
    expect(cashBalance.balance).toBe(-40);

    const expenseBalance = await balanceReadService.getAccountBalance(expense.id, workplaceId);
    expect(expenseBalance.balance).toBe(40);
  });

  it('supports persisting and reading custom account color (v31 schema)', async () => {
    const coloredAccount = await accountWriteRepository.create({
      name: 'Custom Colored Asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
      color: '#3B82F6',
    });

    expect(coloredAccount.color).toBe('#3B82F6');
    const fetched = await accountQueryRepository.find(workplaceId, coloredAccount.id);
    expect(fetched?.color).toBe('#3B82F6');
  });

  it('clears custom color when updated back to auto (empty string)', async () => {
    const coloredAccount = await accountWriteRepository.create({
      name: 'Red Asset',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId,
      color: '#F87171',
    });

    const prepared = await prepareAccountFieldUpdate(workplaceId, coloredAccount.id, {
      color: '',
    });

    const updated = await accountWriteRepository.update(
      coloredAccount,
      prepared.updatePayload,
      workplaceId,
    );

    expect(updated.account.color).toBe('');
    const fetched = await accountQueryRepository.find(workplaceId, coloredAccount.id);
    expect(fetched?.color).toBe('');
  });
});
