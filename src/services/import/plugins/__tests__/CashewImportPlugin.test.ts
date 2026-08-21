import { cashewPlugin } from '@/src/services/import/plugins/cashew-plugin';
import { ImportFileContext } from '@/src/services/import/types';
import * as SQLite from 'expo-sqlite';

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

jest.mock('@/src/data/database/idGenerator', () => ({
  generator: () => 'mock-cashew-id-' + Math.random(),
}));

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
      const mockDb = {
        closeAsync: jest.fn().mockResolvedValue(undefined),
        getAllAsync: jest.fn().mockImplementation((query: string) => {
          if (query.includes('FROM wallets')) {
            return Promise.resolve([
              {
                wallet_pk: 'w-1',
                name: 'Cash Wallet',
                currency: 'USD',
                order: 0,
              },
            ]);
          }
          if (query.includes('FROM categories')) {
            return Promise.resolve([]);
          }
          if (query.includes('FROM transactions')) {
            return Promise.resolve([
              {
                transaction_pk: 'tx-exp-1',
                name: 'Lunch',
                amount: 25,
                category_fk: null, // missing category
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
                category_fk: null, // missing category (should reuse same fallback)
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
                category_fk: null, // missing category
                wallet_fk: 'w-1',
                date_created: '2023-01-02T10:00:00Z',
                income: 1,
                type: 0,
                paid: 1,
              },
            ]);
          }
          if (query.includes('FROM budgets')) {
            return Promise.resolve([]);
          }
          if (query.includes('FROM scanner_templates')) {
            return Promise.resolve([]);
          }
          if (query.includes('FROM objectives')) {
            return Promise.resolve([]);
          }
          return Promise.resolve([]);
        }),
      };

      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

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
});
