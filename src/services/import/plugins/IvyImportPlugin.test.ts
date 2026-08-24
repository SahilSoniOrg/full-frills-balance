import { importRepository } from '@/src/data/repositories/ImportRepository';
import { ivyPlugin } from '@/src/services/import/plugins/ivy-plugin';
import { importService } from '@/src/services/import/ImportService';
import { commitStagedImport } from '@/src/services/import/importStaging';
import { ImportFileContext } from '@/src/services/import/types';
import { CANONICAL_IMPORT_VERSION_V1 } from '@/src/services/import/canonicalImport';
import { preferences } from '@/src/utils/preferences';
import { WorkplaceId } from '@/src/types/ids';

// Mock dependencies
jest.mock('@/src/services/import/preImportBackupService', () => ({
  preImportBackupService: {
    createBackup: jest.fn().mockResolvedValue({ skipped: true, reason: 'empty_workplace' }),
  },
}));

jest.mock('@/src/data/repositories/ImportRepository', () => ({
  importRepository: {
    batchInsert: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/src/services/integrity', () => ({
  integrityService: {
    resetWorkplace: jest.fn().mockResolvedValue(true),
    forceRunCheck: jest.fn().mockResolvedValue({ discrepanciesFound: 0, repairsSuccessful: 0 }),
  },
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    setOnboardingCompleted: jest.fn().mockResolvedValue(true),
    setUserName: jest.fn().mockResolvedValue(true),
    restorePreferences: jest.fn().mockResolvedValue(true),
    setActiveWorkplaceId: jest.fn(),
  },
}));

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getWorkplace: jest.fn().mockResolvedValue({ name: 'Default Workplace' }),
    updateWorkplace: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/src/services/import/importStaging', () => ({
  createImportStagingWorkplace: jest.fn().mockResolvedValue('staging-wp'),
  commitStagedImport: jest.fn().mockResolvedValue(undefined),
  discardImportStagingWorkplace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue({ defaultCurrencyCode: 'USD' }),
        query: jest.fn().mockReturnValue({ fetch: jest.fn().mockResolvedValue([]) }),
      }),
    },
  },
}));

jest.mock('@/src/services/currency-init-service', () => ({
  currencyInitService: {
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    syncTodayRates: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock ID generator
jest.mock('@/src/data/database/idGenerator', () => ({
  generator: () => 'mock-id-' + Math.random(),
}));

describe('IvyImportPlugin', () => {
  const validIvyData = {
    accounts: [
      {
        id: 'ivy-a1',
        name: 'Wallet',
        currency: 'USD',
        color: 0,
        accountCategory: 'ASSET',
        icon: 'wallet-icon',
      },
    ],
    categories: [{ id: 'ivy-c1', name: 'Food', color: 0, icon: 'food-icon' }],
    transactions: [
      {
        id: 'ivy-t1',
        accountId: 'ivy-a1',
        type: 'EXPENSE',
        amount: 50,
        categoryId: 'ivy-c1',
        dateTime: '2023-01-01T10:00:00Z',
      },
    ],
    budgets: [
      {
        id: 'ivy-b1',
        name: 'Food Budget',
        amount: 500,
        categoryIdsSerialized: '["ivy-c1"]',
        isDeleted: false,
      },
    ],
    settings: [{ id: 'ivy-s1', name: 'Sahil', currency: 'INR', isDeleted: false }],
  };

  describe('detect', () => {
    it('returns true for valid Ivy format', () => {
      const context = { json: validIvyData } as ImportFileContext;
      expect(ivyPlugin.detect(context)).toBe(true);
    });

    it('returns false if categories is missing', () => {
      const data = { ...validIvyData };
      delete (data as any).categories;
      const context = { json: data } as ImportFileContext;
      expect(ivyPlugin.detect(context)).toBe(false);
    });
  });

  describe('parse', () => {
    it('returns canonical v1 plugin output', async () => {
      const context = { json: validIvyData } as ImportFileContext;
      const result = await ivyPlugin.parse(context, { defaultCurrency: 'USD' });

      expect(result.canonical?.version).toBe(CANONICAL_IMPORT_VERSION_V1);
      expect(result.canonical?.importMetadata?.pluginId).toBe('ivy');
      expect(result.canonical?.accounts).toHaveLength(3);
    });
  });

  describe('import', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('transforms and imports Ivy data correctly', async () => {
      const context = { json: validIvyData } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      expect(commitStagedImport).toHaveBeenCalledWith('w1', 'staging-wp');
      expect(importRepository.batchInsert).toHaveBeenCalledWith(
        'staging-wp',
        expect.any(Object),
        expect.anything(),
      );

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const walletAcc = lastBatch.accounts.find((a: any) => a.name === 'Wallet');
      const foodAcc = lastBatch.accounts.find((a: any) => a.name === 'Food (USD)');

      expect(walletAcc.icon).toBe('wallet-icon');
      expect(foodAcc.icon).toBe('food-icon');

      // Should create 3 accounts (1 original + 1 transaction category + 1 budget category)
      // Food Budget is linked to "Food" category, which is also used in a transaction.
      // Wait, in validIvyData:
      // "Wallet" (ASSET)
      // "Food" category is used in 1 transaction (Food - USD)
      // "Food" category is ALSO used in 1 budget (Food Budget)
      // So it's still 2 accounts? Let's check why it received 3.
      // Ah, INR vs USD!
      // validIvyData.settings has currency: 'INR'.
      // my code uses ivyBaseCurrency (INR) for budget categories.
      // The transaction uses 'USD' (from account 'ivy-a1').
      // So we get:
      // 1. Wallet (USD)
      // 2. Food (USD) (from transaction)
      // 3. Food (INR) (from budget with base currency INR)
      expect(stats.accounts).toBe(3);
      expect(stats.journals).toBe(1);
      expect(stats.transactions).toBe(2); // 1 Expense = 2 legs
      expect(stats.skippedTransactions).toBe(0);
      expect(stats.auditLogs).toBe(0);

      expect(lastBatch.budgets).toHaveLength(1);
      expect(lastBatch.budgets[0].name).toBe('Food Budget');
      expect(lastBatch.budgets[0].amount).toBe(500); // 500 major units
      expect(lastBatch.budgets[0].currencyCode).toBe('INR'); // From settings
      // Food category exists in 2 accounts now: Food (USD) and Food (INR)
      // The budget scopes both of them.
      expect(lastBatch.budgetScopes).toHaveLength(2);

      expect(preferences.restorePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ userName: 'Sahil' }),
      );
      expect(preferences.setOnboardingCompleted).toHaveBeenCalledWith(true);
    });

    it('handles multi-currency transfers correctly', async () => {
      const dataWithTransfer = {
        ...validIvyData,
        accounts: [
          ...validIvyData.accounts,
          { id: 'ivy-a2', name: 'Bank EUR', currency: 'EUR', color: 0, accountCategory: 'ASSET' },
        ],
        transactions: [
          {
            id: 'ivy-t2',
            accountId: 'ivy-a1',
            toAccountId: 'ivy-a2',
            type: 'TRANSFER',
            amount: 100,
            toAmount: 85,
            dateTime: '2023-01-01T10:00:00Z',
          },
        ],
      };

      const context = { json: dataWithTransfer } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);
      expect(stats.journals).toBe(1);
      expect(stats.transactions).toBe(2);

      // Check if exchange rate was calculated (85 EUR / 100 USD = 0.85)
      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const debitTx = lastBatch.transactions.find(
        (t: any) => t.transactionType === 'DEBIT' && t.exchangeRate !== undefined,
      );
      expect(debitTx.exchangeRate).toBeCloseTo(85 / 100);
      expect(debitTx.currencyCode).toBe('EUR');
    });

    it('handles one-off planned transactions (dueDate) and deleted transactions', async () => {
      const dataWithPlanned = {
        ...validIvyData,
        transactions: [
          ...validIvyData.transactions,
          { id: 'ivy-t-deleted', isDeleted: true, type: 'EXPENSE', amount: 10 },
          {
            id: 'ivy-t-planned',
            dueDate: '2027-01-01',
            type: 'EXPENSE',
            amount: 20,
            categoryId: 'ivy-c1',
            accountId: 'ivy-a1',
          },
        ],
      };

      const context = { json: dataWithPlanned } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      expect(stats.skippedTransactions).toBe(2); // ivy-t-deleted AND ivy-t-planned
      expect(stats.plannedPayments).toBe(0);

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      expect(lastBatch.plannedPayments).toHaveLength(0);
    });

    it('handles one-time planned payment rules', async () => {
      const dataWithOneTimeRule = {
        ...validIvyData,
        plannedPaymentRules: [
          {
            id: 'ivy-rule-1',
            oneTime: true,
            type: 'EXPENSE',
            accountId: 'ivy-a1',
            amount: 100,
            categoryId: 'ivy-c1',
            title: 'One Time Gift',
            startDate: '2027-02-01',
          },
        ],
      };

      const context = { json: dataWithOneTimeRule } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      expect(stats.plannedPayments).toBe(1);

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const pp = lastBatch.plannedPayments.find((p: any) => p.name === 'One Time Gift');
      expect(pp).toBeDefined();
      expect(pp.endDate).toBe(pp.nextOccurrence);
    });

    it('creates accounts for budgeted categories even without transactions', async () => {
      const dataWithBudgetedCategoryOnly = {
        ...validIvyData,
        transactions: [], // No transactions
        budgets: [
          {
            id: 'ivy-b2',
            name: 'New Category Budget',
            amount: 100,
            categoryIdsSerialized: '["ivy-c2"]',
            isDeleted: false,
          },
        ],
        categories: [
          ...validIvyData.categories,
          { id: 'ivy-c2', name: 'Planned Category', color: 0, icon: 'planned-icon' },
        ],
      };

      const context = { json: dataWithBudgetedCategoryOnly } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      // Should create 3 accounts: 1 Wallet + 1 Category Food (unused but in data, though we only create for usage)
      // Wait, IvyPlugin creates accounts for categories in categoryUsageMap.
      // categoryUsageMap now includes categories from budgets.
      // Food (USD) (if it was in a budget or transaction)
      // Planned Category (INR) (INR is from settings in validIvyData)

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const plannedAcc = lastBatch.accounts.find((a: any) => a.name === 'Planned Category (INR)');

      expect(plannedAcc).toBeDefined();
      expect(plannedAcc.icon).toBe('planned-icon');
      expect(stats.budgets).toBe(1);
      expect(lastBatch.budgetScopes).toHaveLength(1);
      expect(lastBatch.budgetScopes[0].accountId).toBe(plannedAcc.id);
    });

    it('handles raw string IDs in categoryIdsSerialized (non-JSON)', async () => {
      const dataWithRawId = {
        ...validIvyData,
        transactions: [],
        budgets: [
          {
            id: 'ivy-b3',
            name: 'Raw ID Budget',
            amount: 200,
            categoryIdsSerialized: 'ivy-c3',
            isDeleted: false,
          },
        ],
        categories: [
          ...validIvyData.categories,
          { id: 'ivy-c3', name: 'Raw Category', color: 0, icon: 'raw-icon' },
        ],
      };

      const context = { json: dataWithRawId } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const rawAcc = lastBatch.accounts.find((a: any) => a.name === 'Raw Category (INR)');

      expect(rawAcc).toBeDefined();
      expect(stats.budgets).toBe(1);
      expect(lastBatch.budgetScopes).toHaveLength(1);
      expect(lastBatch.budgetScopes[0].accountId).toBe(rawAcc.id);
    });

    it('handles system opening balance accounts correctly', async () => {
      const dataWithOpeningBalance = {
        ...validIvyData,
        transactions: [
          {
            id: 'ivy-t-ob',
            accountId: 'ivy-a1',
            type: 'INCOME',
            amount: 1000,
            categoryId: 'ivy-c-ob',
            title: 'Opening Balance',
            dateTime: '2023-01-01T10:00:00Z',
          },
        ],
        categories: [{ id: 'ivy-c-ob', name: 'Opening Balance', color: 0, icon: 'ob-icon' }],
      };

      const context = { json: dataWithOpeningBalance } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const obAcc = lastBatch.accounts.find(
        (a: any) => a.name === 'Opening Balances (USD)' && a.accountType === 'EQUITY',
      );

      expect(obAcc).toBeDefined();
      expect(stats.transactions).toBe(2);

      // Verify mapping: money comes from EQUITY to ASSET for INCOME
      const debitTx = lastBatch.transactions.find((t: any) => t.transactionType === 'DEBIT');
      const creditTx = lastBatch.transactions.find((t: any) => t.transactionType === 'CREDIT');

      expect(debitTx.accountId).toContain('mock-id-'); // Since accountId generation is mocked
      expect(creditTx.accountId).toBe(obAcc.id);
    });

    it('handles system balance correction accounts correctly', async () => {
      const dataWithAdjustBalance = {
        ...validIvyData,
        transactions: [
          {
            id: 'ivy-t-ab',
            accountId: 'ivy-a1',
            type: 'EXPENSE',
            amount: 50,
            categoryId: 'ivy-c-ab',
            title: 'Adjust Balance',
            dateTime: '2023-01-01T10:00:00Z',
          },
        ],
        categories: [{ id: 'ivy-c-ab', name: 'Adjust Balance', color: 0, icon: 'ab-icon' }],
      };

      const context = { json: dataWithAdjustBalance } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const abAcc = lastBatch.accounts.find(
        (a: any) => a.name === 'Balance Corrections (USD)' && a.accountType === 'EQUITY',
      );

      expect(abAcc).toBeDefined();
      expect(stats.transactions).toBe(2);

      // Verify mapping: money goes from ASSET to EQUITY for EXPENSE
      const debitTx = lastBatch.transactions.find((t: any) => t.transactionType === 'DEBIT');
      const creditTx = lastBatch.transactions.find((t: any) => t.transactionType === 'CREDIT');

      expect(debitTx.accountId).toBe(abAcc.id);
      expect(creditTx.accountId).toContain('mock-id-'); // Mock id for asset
    });

    it('creates distinct Unknown Expense and Unknown Income accounts for missing categories', async () => {
      const dataWithMissingCategories = {
        ...validIvyData,
        transactions: [
          {
            id: 'ivy-t-exp-missing',
            accountId: 'ivy-a1',
            type: 'EXPENSE',
            amount: 75,
            dateTime: '2023-01-01T10:00:00Z',
          },
          {
            id: 'ivy-t-inc-missing',
            accountId: 'ivy-a1',
            type: 'INCOME',
            amount: 150,
            dateTime: '2023-01-02T10:00:00Z',
          },
        ],
        categories: [],
      };

      const context = { json: dataWithMissingCategories } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const unknownExpenseAcc = lastBatch.accounts.find(
        (a: any) => a.name === 'Unknown Expense (USD)' && a.accountType === 'EXPENSE',
      );
      const unknownIncomeAcc = lastBatch.accounts.find(
        (a: any) => a.name === 'Unknown Income (USD)' && a.accountType === 'INCOME',
      );

      expect(unknownExpenseAcc).toBeDefined();
      expect(unknownIncomeAcc).toBeDefined();
      expect(unknownExpenseAcc.id).not.toBe(unknownIncomeAcc.id);
      expect(stats.transactions).toBe(4);

      // Verify the expense transaction debits the Unknown Expense account
      const expenseLegs = lastBatch.transactions.filter(
        (t: any) => t.journalId === lastBatch.journals.find((j: any) => j.totalAmount === 75).id,
      );
      const expenseDebit = expenseLegs.find((t: any) => t.transactionType === 'DEBIT');
      expect(expenseDebit.accountId).toBe(unknownExpenseAcc.id);

      // Verify the income transaction credits the Unknown Income account
      const incomeLegs = lastBatch.transactions.filter(
        (t: any) => t.journalId === lastBatch.journals.find((j: any) => j.totalAmount === 150).id,
      );
      const incomeCredit = incomeLegs.find((t: any) => t.transactionType === 'CREDIT');
      expect(incomeCredit.accountId).toBe(unknownIncomeAcc.id);
    });

    it('creates a single unified category account when a valid category is shared across types', async () => {
      const dataWithSharedCategory = {
        ...validIvyData,
        categories: [{ id: 'ivy-c-misc', name: 'Miscellaneous', color: 0, icon: 'misc-icon' }],
        transactions: [
          {
            id: 'ivy-t-exp-misc',
            accountId: 'ivy-a1',
            type: 'EXPENSE',
            amount: 30,
            categoryId: 'ivy-c-misc',
            dateTime: '2023-01-01T10:00:00Z',
          },
          {
            id: 'ivy-t-inc-misc',
            accountId: 'ivy-a1',
            type: 'INCOME',
            amount: 200,
            categoryId: 'ivy-c-misc',
            dateTime: '2023-01-02T10:00:00Z',
          },
        ],
      };

      const context = { json: dataWithSharedCategory } as ImportFileContext;
      const stats = await importService.executeImport(ivyPlugin, context, 'w1' as WorkplaceId);

      const lastBatch = (importRepository.batchInsert as jest.Mock).mock.calls[0][1];
      const miscAccounts = lastBatch.accounts.filter((a: any) =>
        a.name.startsWith('Miscellaneous'),
      );

      // Exactly ONE account for the valid category
      expect(miscAccounts).toHaveLength(1);
      expect(miscAccounts[0].name).toBe('Miscellaneous (USD)');
      expect(stats.transactions).toBe(4);

      // Verify both expense and income legs point to the single category account
      const expenseLegs = lastBatch.transactions.filter(
        (t: any) => t.journalId === lastBatch.journals.find((j: any) => j.totalAmount === 30).id,
      );
      const expenseDebit = expenseLegs.find((t: any) => t.transactionType === 'DEBIT');
      expect(expenseDebit.accountId).toBe(miscAccounts[0].id);

      const incomeLegs = lastBatch.transactions.filter(
        (t: any) => t.journalId === lastBatch.journals.find((j: any) => j.totalAmount === 200).id,
      );
      const incomeCredit = incomeLegs.find((t: any) => t.transactionType === 'CREDIT');
      expect(incomeCredit.accountId).toBe(miscAccounts[0].id);
    });
  });
});
