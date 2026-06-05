import { importRepository } from '@/src/data/repositories/ImportRepository';
import { nativePlugin } from '@/src/services/import/plugins/native-plugin';
import { importRunner } from '@/src/services/import/runner';
import { ImportFileContext } from '@/src/services/import/types';
import { integrityService } from '@/src/services/integrity-service';
import { preferences } from '@/src/utils/preferences';
import { WorkplaceId } from '@/src/types/domain';

// Mock dependencies
jest.mock('@/src/data/repositories/ImportRepository', () => ({
  importRepository: {
    batchInsert: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/src/services/integrity-service', () => ({
  integrityService: {
    resetWorkplace: jest.fn().mockResolvedValue(true),
    forceRunCheck: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    restorePreferences: jest.fn().mockResolvedValue(true),
    setActiveWorkplaceId: jest.fn(),
    setOnboardingCompleted: jest.fn(),
  },
}));

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getWorkplace: jest.fn().mockResolvedValue({ name: 'Default Workplace' }),
    updateWorkplace: jest.fn().mockResolvedValue(true),
  },
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

describe('NativeImportPlugin', () => {
  const validNativeData = {
    version: '1.4.0',
    preferences: { userName: 'Test User' },
    accounts: [
      {
        id: 'a1',
        name: 'Acc 1',
        accountType: 'ASSET',
        currencyCode: 'USD',
        reconciledAt: '2024-01-01T00:00:00Z',
      },
    ],
    journals: [
      {
        id: 'j1',
        journalDate: '2024-01-01T00:00:00Z',
        currencyCode: 'USD',
        status: 'POSTED',
        totalAmount: 10,
        transactionCount: 2,
        displayType: 'EXPENSE',
      },
    ],
    transactions: [
      {
        id: 't1',
        accountId: 'a1',
        journalId: 'j1',
        amount: 10,
        transactionType: 'DEBIT',
        currencyCode: 'USD',
        transactionDate: '2024-01-01T00:00:00Z',
      },
    ],
    auditLogs: [
      {
        id: 'log1',
        entityType: 'account',
        entityId: 'a1',
        action: 'CREATE',
        changes: '{}',
        timestamp: Date.now(),
      },
    ],
    budgets: [
      {
        id: 'b1',
        name: 'Food',
        amount: 1000,
        currencyCode: 'USD',
        startMonth: '2024-01',
        active: true,
        intervalType: 'MONTHLY',
        intervalN: 1,
        startDate: '2024-01-01T00:00:00Z',
        recurrenceDay: 1,
        recurrenceMonth: 1,
        assetAccountIds: 'a1',
      },
    ],
    budgetScopes: [{ id: 'bs1', budgetId: 'b1', accountId: 'a1' }],
    currencies: [{ id: 'c1', code: 'USD', symbol: '$', name: 'US Dollar', precision: 2 }],
    exchangeRates: [
      {
        id: 'er1',
        fromCurrency: 'USD',
        toCurrency: 'INR',
        rate: 80,
        effectiveDate: '2024-01-01T00:00:00Z',
        source: 'manual',
      },
    ],
    accountMetadata: [
      {
        id: 'm1',
        accountId: 'a1',
        statementDay: 5,
        payFromAccountId: 'a1',
        minPaymentOnly: true,
        minimumPaymentPercent: 5,
      },
    ],
    transactionAutoPostRules: [
      {
        id: 'r1',
        priority: 1,
        sourceAccountId: 'a1',
        categoryAccountId: 'a1',
        isActive: true,
        channelsJson: '["sms"]',
      },
    ],
    balanceSnapshots: [
      {
        id: 'bs1',
        accountId: 'a1',
        transactionId: 't1',
        transactionDate: '2024-01-01T00:00:00Z',
        absoluteBalance: 10,
        transactionCount: 1,
      },
    ],
  };

  describe('detect', () => {
    it('returns true for valid native format', () => {
      const context = { json: validNativeData } as ImportFileContext;
      expect(nativePlugin.detect(context)).toBe(true);
    });

    it('returns false if version is missing', () => {
      const data = { ...validNativeData };
      delete (data as any).version;
      const context = { json: data } as ImportFileContext;
      expect(nativePlugin.detect(context)).toBe(false);
    });

    it('returns false if categories is present (Ivy format)', () => {
      const data = { ...validNativeData, categories: [] };
      const context = { json: data } as ImportFileContext;
      expect(nativePlugin.detect(context)).toBe(false);
    });
  });

  describe('import', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('performs full import process', async () => {
      const context = { json: validNativeData } as ImportFileContext;
      const stats = await importRunner.runImport(nativePlugin, context, 'w1' as WorkplaceId);

      expect(integrityService.resetWorkplace).toHaveBeenCalledWith('w1', true);
      expect(preferences.restorePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ userName: 'Test User' }),
      );
      expect(importRepository.batchInsert).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({
          budgets: expect.any(Array),
          budgetScopes: expect.any(Array),
          accountMetadata: expect.any(Array),
          balanceSnapshots: expect.any(Array),
        }),
        expect.anything(),
      );

      expect(integrityService.forceRunCheck).toHaveBeenCalled();

      expect(stats.accounts).toBe(1);
      expect(stats.journals).toBe(1);
      expect(stats.transactions).toBe(1);
      expect(stats.budgets).toBe(1);
      expect(stats.auditLogs).toBe(1);
    });

    it('throws error for missing parsed JSON', async () => {
      const context = { json: null } as unknown as ImportFileContext;
      await expect(
        importRunner.runImport(nativePlugin, context, 'w1' as WorkplaceId),
      ).rejects.toThrow(/Invalid JSON/);
    });

    it('throws error for missing sections', async () => {
      const incompleteData = { version: '1.0' };
      const context = { json: incompleteData } as ImportFileContext;
      await expect(
        importRunner.runImport(nativePlugin, context, 'w1' as WorkplaceId),
      ).rejects.toThrow(/missing required data/);
    });

    it('remaps IDs correctly and maintains references', async () => {
      const context = { json: validNativeData } as ImportFileContext;
      await importRunner.runImport(nativePlugin, context, 'w1' as WorkplaceId);

      const batchInsertCall = (importRepository.batchInsert as jest.Mock).mock.calls[0];
      const data = batchInsertCall[1];

      // Check account ID remapping
      const oldAccountId = validNativeData.accounts[0].id; // 'a1'
      const newAccountId = data.accounts[0].id;
      expect(newAccountId).not.toBe(oldAccountId);
      expect(newAccountId).toBeDefined();

      // Check transaction -> account reference
      expect(data.transactions[0].accountId).toBe(newAccountId);
      expect(data.transactions[0].id).not.toBe(validNativeData.transactions[0].id);

      // Check journal -> transaction reference
      const newJournalId = data.journals[0].id;
      expect(data.transactions[0].journalId).toBe(newJournalId);
      expect(newJournalId).not.toBe(validNativeData.journals[0].id);

      // Check budget scope references
      expect(data.budgetScopes[0].budgetId).toBe(data.budgets[0].id);
      expect(data.budgetScopes[0].accountId).toBe(newAccountId);

      // Check audit log reference
      expect(data.auditLogs[0].entityId).toBe(newAccountId);
      expect(data.auditLogs[0].id).not.toBe(validNativeData.auditLogs[0].id);

      // Check budget schedule mapping and ID remapping in assetAccountIds
      expect(data.budgets[0].intervalType).toBe('MONTHLY');
      expect(data.budgets[0].intervalN).toBe(1);
      expect(data.budgets[0].startDate).toBeDefined();
      expect(data.budgets[0].recurrenceDay).toBe(1);
      expect(data.budgets[0].recurrenceMonth).toBe(1);
      expect(data.budgets[0].assetAccountIds).toBe(newAccountId);

      // Check account metadata mapping and ID remapping in payFromAccountId
      expect(data.accountMetadata[0].payFromAccountId).toBe(newAccountId);
      expect(data.accountMetadata[0].minPaymentOnly).toBe(true);
      expect(data.accountMetadata[0].minimumPaymentPercent).toBe(5);

      // Check transaction auto post rules mapping
      expect(data.transactionAutoPostRules[0].channelsJson).toBe('["sms"]');
      expect(data.transactionAutoPostRules[0].sourceAccountId).toBe(newAccountId);
    });
  });
});
