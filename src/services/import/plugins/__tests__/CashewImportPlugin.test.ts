import { cashewPlugin } from '@/src/services/import/plugins/cashew-plugin';
import { ImportFileContext } from '@/src/services/import/types';
import * as SQLite from 'expo-sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock('@/src/utils/files', () => ({
  files: {
    document: '/mock/documents/',
    ensureDirectory: jest.fn().mockResolvedValue(undefined),
    copy: jest.fn().mockResolvedValue(undefined),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/data/database/idGenerator', () => {
  let n = 0;
  return {
    generator: () => `mock-cashew-id-${++n}`,
  };
});

type FixtureRows = {
  wallets: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  budgets: Record<string, unknown>[];
  objectives: Record<string, unknown>[];
};

const CURRENT_CASHEW_COLUMNS: Record<string, string[]> = {
  wallets: [
    'wallet_pk',
    'name',
    'colour',
    'icon_name',
    'currency',
    'order',
    'archived',
    'date_time_modified',
  ],
  categories: [
    'category_pk',
    'name',
    'colour',
    'icon_name',
    'income',
    'main_category_pk',
    'order',
    'archived',
    'date_time_modified',
  ],
  transactions: [
    'transaction_pk',
    'name',
    'amount',
    'note',
    'category_fk',
    'sub_category_fk',
    'wallet_fk',
    'date_created',
    'income',
    'type',
    'paired_transaction_fk',
    'paid',
    'period_length',
    'reoccurrence',
    'end_date',
    'objective_loan_fk',
    'objective_fk',
  ],
  budgets: [
    'budget_pk',
    'name',
    'amount',
    'start_date',
    'wallet_fks',
    'category_fks',
    'income',
    'archived',
    'period_length',
    'reoccurrence',
  ],
  objectives: [
    'objective_pk',
    'type',
    'name',
    'amount',
    'order',
    'colour',
    'date_created',
    'end_date',
    'date_time_modified',
    'icon_name',
    'emoji_icon_name',
    'income',
    'pinned',
    'archived',
    'wallet_fk',
  ],
};

const pragmaRows = (table: string, columns = CURRENT_CASHEW_COLUMNS[table] ?? []) =>
  columns.map(name => ({ name }));

const loadFullFixtureRows = (): FixtureRows =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../../../../fixtures/cashew/cashew-full-2026-10-29.rows.json'),
      'utf8',
    ),
  ) as FixtureRows;

const mockDbFromRows = (
  rows: Partial<FixtureRows>,
  columns: Record<string, string[]> = CURRENT_CASHEW_COLUMNS,
) => ({
  closeAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockImplementation((query: string) => {
    const pragmaMatch = query.match(/PRAGMA table_info\((\w+)\)/i);
    if (pragmaMatch) {
      return Promise.resolve(pragmaRows(pragmaMatch[1], columns[pragmaMatch[1]]));
    }
    if (query.includes('FROM wallets')) return Promise.resolve(rows.wallets ?? []);
    if (query.includes('FROM categories')) return Promise.resolve(rows.categories ?? []);
    if (query.includes('FROM transactions')) return Promise.resolve(rows.transactions ?? []);
    if (query.includes('FROM budgets')) return Promise.resolve(rows.budgets ?? []);
    if (query.includes('FROM objectives')) return Promise.resolve(rows.objectives ?? []);
    return Promise.resolve([]);
  }),
});

describe('CashewImportPlugin', () => {
  describe('detect', () => {
    it('detects SQLite file with cashew in name', () => {
      const sqliteHeader = Buffer.from('SQLite format 3\0');
      const context = {
        name: 'cashew_backup.db',
        uri: 'file:///cashew_backup.db',
        rawBytes: new Uint8Array(sqliteHeader),
      } as ImportFileContext;

      expect(cashewPlugin.detect(context)).toBe(true);
    });

    it('returns false when not an SQLite file', () => {
      const context = {
        name: 'cashew_backup.db',
        uri: 'file:///cashew_backup.db',
        rawBytes: new Uint8Array([1, 2, 3, 4]),
      } as ImportFileContext;

      expect(cashewPlugin.detect(context)).toBe(false);
    });
  });

  describe('parse with missing category_fk', () => {
    it('creates fallback Unknown Expense and Unknown Income category accounts without dropping transactions', async () => {
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(
        mockDbFromRows({
          wallets: [
            {
              wallet_pk: 'w-1',
              name: 'Cash Wallet',
              currency: 'USD',
              order: 0,
            },
          ],
          transactions: [
            {
              transaction_pk: 'tx-exp-1',
              name: 'Lunch',
              amount: 25,
              category_fk: null,
              wallet_fk: 'w-1',
              date_created: '2023-01-01T12:00:00Z',
              income: 0,
              type: 0,
              paid: 1,
            },
            {
              transaction_pk: 'tx-exp-2',
              name: 'Dinner',
              amount: 40,
              category_fk: null,
              wallet_fk: 'w-1',
              date_created: '2023-01-01T19:00:00Z',
              income: 0,
              type: 0,
              paid: 1,
            },
            {
              transaction_pk: 'tx-inc-1',
              name: 'Bonus',
              amount: 500,
              category_fk: null,
              wallet_fk: 'w-1',
              date_created: '2023-01-02T10:00:00Z',
              income: 1,
              type: 0,
              paid: 1,
            },
          ],
        }),
      );

      const sqliteHeader = Buffer.from('SQLite format 3\0');
      const context = {
        name: 'cashew_backup.db',
        uri: 'file:///cashew_backup.db',
        rawBytes: new Uint8Array(sqliteHeader),
      } as ImportFileContext;

      const result = await cashewPlugin.parse(context, { defaultCurrency: 'USD' });

      expect(result.canonical).toBeDefined();
      const accounts = result.canonical!.accounts;
      const unknownExpense = accounts.find(
        a => a.name === 'Unknown Expense (USD)' && a.accountType === 'EXPENSE',
      );
      const unknownIncome = accounts.find(
        a => a.name === 'Unknown Income (USD)' && a.accountType === 'INCOME',
      );

      expect(unknownExpense).toBeDefined();
      expect(unknownIncome).toBeDefined();
      expect(unknownExpense!.id).not.toBe(unknownIncome!.id);

      // Verify all 3 transactions were parsed and not skipped
      expect(result.stats.skippedTransactions).toBe(0);
      expect(result.canonical!.journals).toHaveLength(3);
      expect(result.canonical!.transactions).toHaveLength(6);

      // Verify expense transactions mapped to unknownExpense account
      const expenseJournals = result.canonical!.journals.filter(j => j.displayType === 'EXPENSE');
      expect(expenseJournals).toHaveLength(2);

      const expenseJournalIds = new Set(expenseJournals.map(j => j.id));
      const expenseLegs = result.canonical!.transactions.filter(
        t => expenseJournalIds.has(t.journalId) && t.accountId === unknownExpense!.id,
      );
      expect(expenseLegs).toHaveLength(2);

      // Verify income transaction mapped to unknownIncome account
      const incomeJournal = result.canonical!.journals.find(j => j.displayType === 'INCOME');
      expect(incomeJournal).toBeDefined();
      const incomeLeg = result.canonical!.transactions.find(
        t => t.journalId === incomeJournal!.id && t.accountId === unknownIncome!.id,
      );
      expect(incomeLeg).toBeDefined();
    });
  });

  describe('parse with cross-currency transfers', () => {
    it('preserves both wallet amounts when Cashew links only the source row', async () => {
      const mirrorRow = {
        transaction_pk: 'tx-eur',
        name: 'USD to EUR',
        amount: 90,
        category_fk: '0',
        sub_category_fk: null,
        wallet_fk: 'wallet-eur',
        date_created: '2026-10-29T12:00:00Z',
        income: 0,
        type: 0,
        paired_transaction_fk: null,
        paid: 1,
        period_length: 1,
        reoccurrence: null,
        end_date: null,
        objective_loan_fk: null,
      };
      const sourceRow = {
        transaction_pk: 'tx-usd',
        name: 'USD to EUR',
        amount: -100,
        category_fk: '0',
        sub_category_fk: null,
        wallet_fk: 'wallet-usd',
        date_created: '2026-10-29T12:00:00Z',
        income: 0,
        type: 0,
        paired_transaction_fk: 'tx-eur',
        paid: 1,
        period_length: 1,
        reoccurrence: null,
        end_date: null,
        objective_loan_fk: null,
      };
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(
        mockDbFromRows({
          wallets: [
            {
              wallet_pk: 'wallet-usd',
              name: 'USD Wallet',
              colour: null,
              icon_name: null,
              currency: 'USD',
              order: 0,
              archived: 0,
              date_time_modified: null,
            },
            {
              wallet_pk: 'wallet-eur',
              name: 'EUR Wallet',
              colour: null,
              icon_name: null,
              currency: 'EUR',
              order: 1,
              archived: 0,
              date_time_modified: null,
            },
          ],
          // The unpaired mirror sorts first in this backup.
          transactions: [mirrorRow, sourceRow],
        }),
      );

      const context = {
        name: 'cashew_backup.db',
        uri: 'file:///cashew_backup.db',
        rawBytes: new Uint8Array(Buffer.from('SQLite format 3\0')),
      } as ImportFileContext;
      const result = await cashewPlugin.parse(context, { defaultCurrency: 'USD' });
      const journal = result.canonical!.journals.find(item => item.displayType === 'TRANSFER')!;
      const usdWallet = result.canonical!.accounts.find(account => account.name === 'USD Wallet')!;
      const eurWallet = result.canonical!.accounts.find(account => account.name === 'EUR Wallet')!;
      const lines = result.canonical!.transactions.filter(line => line.journalId === journal.id);
      const usdLine = lines.find(line => line.accountId === usdWallet.id)!;
      const eurLine = lines.find(line => line.accountId === eurWallet.id)!;

      expect(result.canonical!.journals).toHaveLength(1);
      expect(result.stats.skippedItems).toHaveLength(0);
      expect(usdLine).toMatchObject({
        amount: 100,
        currencyCode: 'USD',
        transactionType: 'CREDIT',
      });
      expect(eurLine).toMatchObject({ amount: 90, currencyCode: 'EUR', transactionType: 'DEBIT' });
      expect(eurLine.exchangeRate).toBeCloseTo(100 / 90);
    });
  });

  describe('parse cashew-full fixture', () => {
    it('restores transfers, loan movements, dining budget scopes, and funding wallets', async () => {
      const rows = loadFullFixtureRows();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDbFromRows(rows));

      const context = {
        name: 'cashew-full-2026-10-29.sql',
        uri: 'file:///cashew-full-2026-10-29.sql',
        rawBytes: new Uint8Array(Buffer.from('SQLite format 3\0')),
      } as ImportFileContext;

      const result = await cashewPlugin.parse(context, { defaultCurrency: 'USD' });
      const { canonical } = result;
      expect(canonical).toBeDefined();

      // Paired "Bank to cash" collapses to one transfer; loan Initial Record is a transfer.
      const transfers = canonical!.journals.filter(j => j.displayType === 'TRANSFER');
      expect(transfers).toHaveLength(2);
      expect(canonical!.journals).toHaveLength(5);

      const loanAccount = canonical!.accounts.find(a => a.name === 'Loan: Alex - laptop loan');
      expect(loanAccount).toBeDefined();
      expect(loanAccount!.accountSubtype).toBe('RECEIVABLE');

      const hardware = canonical!.accounts.find(a => a.name.startsWith('Hardware ('));
      expect(hardware?.parentAccountId).toBeDefined();
      const loansCategory = canonical!.accounts.find(a => a.name.startsWith('Loans ('));
      expect(hardware!.parentAccountId).toBe(loansCategory!.id);

      expect(canonical!.budgets).toHaveLength(1);
      const budget = canonical!.budgets![0];
      expect(budget.name).toBe('Monthly dining budget');
      expect(budget.id).toBe('0b48a951-2f69-4c33-a84e-47bc7eee215c');

      const dining = canonical!.accounts.find(a => a.name === 'Dining (USD)')!;
      expect(canonical!.budgetScopes!.map(s => s.accountId)).toEqual([dining.id]);

      const bank = canonical!.accounts.find(a => a.name === 'Bank')!;
      expect(budget.assetAccountIds).toBe(bank.id);

      expect(canonical!.plannedPayments).toHaveLength(1);
      expect(canonical!.plannedPayments![0].name).toBe('Monthly internet');
    });
  });

  describe('parse edge cases', () => {
    const sqliteContext = {
      name: 'cashew_backup.db',
      uri: 'file:///cashew_backup.db',
      rawBytes: new Uint8Array(Buffer.from('SQLite format 3\0')),
    } as ImportFileContext;

    it('skips savings-goal transactions linked via objective_fk', async () => {
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(
        mockDbFromRows({
          wallets: [{ wallet_pk: 'w-1', name: 'Cash', currency: 'USD', order: 0 }],
          transactions: [
            {
              transaction_pk: 'tx-goal',
              name: 'Emergency contribution',
              amount: -50,
              category_fk: '0',
              wallet_fk: 'w-1',
              date_created: '2026-10-01T12:00:00Z',
              income: 0,
              type: 0,
              paid: 1,
              objective_fk: 'goal-1',
              objective_loan_fk: null,
            },
          ],
          objectives: [
            {
              objective_pk: 'goal-1',
              type: 0,
              name: 'Emergency fund',
              amount: 1000,
              order: 0,
              income: 1,
              archived: 0,
              wallet_fk: 'w-1',
            },
          ],
        }),
      );

      const result = await cashewPlugin.parse(sqliteContext, { defaultCurrency: 'USD' });
      expect(result.canonical!.journals).toHaveLength(0);
      expect(result.stats.skippedTransactions).toBe(1);
      expect(result.stats.skippedItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'tx-goal',
            reason: expect.stringContaining('Savings goal'),
          }),
        ]),
      );
    });

    it('skips unscoped budgets with EMPTY_BUDGET_SCOPE', async () => {
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(
        mockDbFromRows({
          wallets: [{ wallet_pk: 'w-1', name: 'Cash', currency: 'USD', order: 0 }],
          budgets: [
            {
              budget_pk: 'b-empty',
              name: 'Unscoped',
              amount: 100,
              start_date: 1700000000,
              wallet_fks: null,
              category_fks: '[]',
              income: 0,
              archived: 0,
              period_length: 1,
              reoccurrence: 3,
            },
          ],
        }),
      );

      const result = await cashewPlugin.parse(sqliteContext, { defaultCurrency: 'USD' });
      expect(result.canonical!.budgets).toHaveLength(0);
      expect(result.stats.skippedItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'b-empty',
            reason: expect.stringContaining('no category scopes'),
          }),
        ]),
      );
    });

    it('parses older backups missing objective_fk and archived columns', async () => {
      const legacyColumns = {
        wallets: ['wallet_pk', 'name', 'colour', 'icon_name', 'currency', 'order'],
        categories: [
          'category_pk',
          'name',
          'colour',
          'icon_name',
          'income',
          'main_category_pk',
          'order',
        ],
        transactions: [
          'transaction_pk',
          'name',
          'amount',
          'note',
          'category_fk',
          'wallet_fk',
          'date_created',
          'income',
          'type',
          'paired_transaction_fk',
          'paid',
          'period_length',
          'reoccurrence',
          'end_date',
        ],
        budgets: [
          'budget_pk',
          'name',
          'amount',
          'start_date',
          'wallet_fks',
          'category_fks',
          'income',
          'archived',
        ],
        objectives: ['objective_pk', 'type', 'name', 'amount', 'order', 'income', 'wallet_fk'],
      };

      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(
        mockDbFromRows(
          {
            wallets: [{ wallet_pk: 'w-1', name: 'Cash', currency: 'USD', order: 0 }],
            categories: [
              {
                category_pk: 'c-1',
                name: 'Food',
                income: 0,
                main_category_pk: null,
                order: 0,
              },
            ],
            transactions: [
              {
                transaction_pk: 'tx-1',
                name: 'Lunch',
                amount: 12,
                category_fk: 'c-1',
                wallet_fk: 'w-1',
                date_created: '2023-01-01T12:00:00Z',
                income: 0,
                type: 0,
                paid: 1,
              },
            ],
          },
          legacyColumns,
        ),
      );

      const result = await cashewPlugin.parse(sqliteContext, { defaultCurrency: 'USD' });
      expect(result.canonical!.journals).toHaveLength(1);
      expect(result.stats.skippedTransactions).toBe(0);
      const selects = (SQLite.openDatabaseAsync as jest.Mock).mock.results[0].value;
      await selects; // ensure mock resolved
      const db = await (SQLite.openDatabaseAsync as jest.Mock).mock.results[
        (SQLite.openDatabaseAsync as jest.Mock).mock.results.length - 1
      ].value;
      const sqlCalls = (db.getAllAsync as jest.Mock).mock.calls.map((call: string[]) => call[0]);
      expect(sqlCalls.some((sql: string) => sql.includes('NULL AS objective_fk'))).toBe(true);
      expect(sqlCalls.some((sql: string) => sql.includes('NULL AS archived'))).toBe(true);
    });
  });
});
