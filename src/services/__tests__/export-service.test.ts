import { database } from '@/src/data/database/Database';
import { exportService } from '@/src/services/export-service';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    adapter: {},
    collections: {
      get: jest.fn(),
    },
  },
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    loadPreferences: jest.fn(),
  },
}));

jest.mock('@/src/utils/logger');

describe('ExportService', () => {
  const mockGet = database.collections.get as jest.Mock;

  const createCollectionMock = (rows: unknown[], count = rows.length) => ({
    query: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue(rows),
      fetchCount: jest.fn().mockResolvedValue(count),
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportToJSON', () => {
    it('should export full app state', async () => {
      const FIXED_DATE = new Date('2024-01-01T12:00:00Z');

      const mockCollections = new Map<string, unknown>([
        [
          'accounts',
          createCollectionMock([
            {
              id: 'acc1',
              name: 'Cash',
              accountType: 'ASSET',
              accountSubcategory: 'CASH',
              currencyCode: 'USD',
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'journals',
          createCollectionMock([
            {
              id: 'j1',
              journalDate: FIXED_DATE.valueOf(),
              currencyCode: 'USD',
              totalAmount: 100,
              transactionCount: 2,
              displayType: 'EXPENSE',
              status: 'POSTED',
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'transactions',
          createCollectionMock([
            {
              id: 't1',
              journalId: 'j1',
              accountId: 'acc1',
              amount: 100,
              transactionType: 'DEBIT',
              currencyCode: 'USD',
              transactionDate: FIXED_DATE.valueOf(),
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'audit_logs',
          createCollectionMock([
            {
              id: 'log1',
              entityType: 'account',
              entityId: 'acc1',
              action: 'CREATE',
              changes: '{}',
              timestamp: FIXED_DATE.valueOf(),
              createdAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'budgets',
          createCollectionMock([
            {
              id: 'b1',
              name: 'Food',
              amount: 1000,
              currencyCode: 'USD',
              startMonth: '2024-01',
              active: true,
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'budget_scopes',
          createCollectionMock([
            {
              id: 'bs1',
              budget: { id: 'b1' },
              account: { id: 'acc1' },
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'currencies',
          createCollectionMock([
            {
              id: 'c1',
              code: 'USD',
              symbol: '$',
              name: 'US Dollar',
              precision: 2,
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'exchange_rates',
          createCollectionMock([
            {
              id: 'er1',
              fromCurrency: 'USD',
              toCurrency: 'INR',
              rate: 80,
              effectiveDate: FIXED_DATE.valueOf(),
              source: 'manual',
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'account_metadata',
          createCollectionMock([
            {
              id: 'm1',
              account: { id: 'acc1' },
              statementDay: 1,
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
        [
          'balance_snapshots',
          createCollectionMock([
            {
              id: 'bs1',
              account: { id: 'acc1' },
              transactionId: 't1',
              transactionDate: FIXED_DATE.valueOf(),
              absoluteBalance: 100,
              transactionCount: 1,
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
            },
          ]),
        ],
      ]);

      mockGet.mockImplementation((tableName: string) => mockCollections.get(tableName));
      (preferences.loadPreferences as jest.Mock).mockResolvedValue({ theme: 'dark' });

      const zipData = await exportService.exportToJSON('test-workplace' as WorkplaceId);
      expect(zipData).toBeInstanceOf(Uint8Array);

      // Verify that the compression layer was called with a backup.json
      const { compression } = require('@/src/utils/compression');
      expect(compression.createZipArchive).toHaveBeenCalledWith(
        expect.stringContaining('test-workplace'),
        expect.objectContaining({
          'backup.json': expect.any(String),
        }),
      );
    });

    it('should handle errors', async () => {
      mockGet.mockImplementation(() => {
        throw new Error('DB Fail');
      });

      await expect(exportService.exportToJSON('test-workplace' as WorkplaceId)).rejects.toThrow(
        'DB Fail',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getExportSummary', () => {
    it('should return counts for all entities', async () => {
      const mockCollections = new Map<string, unknown>([
        ['accounts', createCollectionMock([], 5)],
        ['journals', createCollectionMock([], 10)],
        ['transactions', createCollectionMock([], 20)],
        ['audit_logs', createCollectionMock([], 3)],
        ['budgets', createCollectionMock([], 4)],
        ['budget_scopes', createCollectionMock([], 6)],
        ['currencies', createCollectionMock([], 2)],
        ['exchange_rates', createCollectionMock([], 7)],
        ['account_metadata', createCollectionMock([], 8)],
        ['balance_snapshots', createCollectionMock([], 9)],
      ]);

      mockGet.mockImplementation((tableName: string) => mockCollections.get(tableName));

      const summary = await exportService.getExportSummary();

      expect(summary.accounts).toBe(5);
      expect(summary.journals).toBe(10);
      expect(summary.transactions).toBe(20);
      expect(summary.auditLogs).toBe(3);
      expect(summary.budgets).toBe(4);
      expect(summary.budgetScopes).toBe(6);
      expect(summary.currencies).toBe(2);
      expect(summary.exchangeRates).toBe(7);
      expect(summary.accountMetadata).toBe(8);
      expect(summary.balanceSnapshots).toBe(9);
    });
  });
});
