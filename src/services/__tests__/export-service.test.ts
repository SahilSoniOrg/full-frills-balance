import { database } from '@/src/data/database/Database';
import { supportsRawSql } from '@/src/data/database/DatabaseUtils';
import { schema } from '@/src/data/database/schema';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { exportService } from '@/src/services/export-service';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { compression } from '@/src/utils/compression';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    adapter: {},
    collections: {
      get: jest.fn(),
    },
  },
}));

jest.mock('@/src/data/database/DatabaseUtils', () => ({
  supportsRawSql: jest.fn(() => false),
}));

jest.mock('@/src/data/repositories/TransactionRawRepository', () => ({
  transactionRawRepository: {
    queryRaw: jest.fn(),
  },
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    loadPreferences: jest.fn(),
  },
}));

jest.mock('@/src/utils/logger');
jest.mock('@/src/utils/compression', () => ({
  compression: {
    createZipArchive: jest.fn().mockResolvedValue({
      base64: 'mockZipData',
      cleanup: jest.fn(),
    }),
  },
}));

describe('ExportService', () => {
  const mockGet = database.collections.get as jest.Mock;

  const createCollectionMock = (rows: unknown[], count = rows.length) => ({
    query: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue(rows),
      fetchCount: jest.fn().mockResolvedValue(count),
    }),
    find: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(
          rows.find((r: any) => r.id === id) ||
            rows[0] || { id, name: 'Personal', createdAt: new Date(), updatedAt: new Date() },
        ),
      ),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportToJSON', () => {
    it('should export full app state', async () => {
      const FIXED_DATE = new Date('2024-01-01T12:00:00Z');

      const mockCollections = new Map<string, unknown>([
        [
          'workplaces',
          createCollectionMock([
            { id: 'wp-1', name: 'Personal', createdAt: FIXED_DATE, updatedAt: FIXED_DATE },
          ]),
        ],
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
      expect(typeof zipData).toBe('string');

      // Verify that the compression layer was called with a backup.json
      expect(compression.createZipArchive).toHaveBeenCalledWith(
        'export',
        expect.objectContaining({
          'backup.json': expect.any(String),
        }),
      );

      const zipCall = (compression.createZipArchive as jest.Mock).mock.calls[0];
      const backupJson = zipCall[1]['backup.json'] as string;
      const parsed = JSON.parse(backupJson);
      expect(parsed.schemaVersion).toBe(schema.version);
      expect(parsed.currencies).toEqual(expect.any(Array));
      expect(parsed.exchange_rates).toEqual(expect.any(Array));
      expect(parsed.balance_snapshots).toEqual(expect.any(Array));
    });

    it('excludes soft-deleted journals and transaction legs from raw SQL export', async () => {
      const FIXED_DATE = new Date('2024-01-01T12:00:00Z');
      (supportsRawSql as jest.Mock).mockReturnValue(true);
      (transactionRawRepository.queryRaw as jest.Mock).mockImplementation(
        async (sql: string, _params: unknown[], tableName: string) => {
          expect(sql).toEqual(expect.any(String));
          if (tableName === 'transactions') {
            expect(sql).toContain('deleted_at IS NULL');
            return [
              {
                id: 't-active',
                journalId: 'j-active',
                accountId: 'acc1',
                amount: 10,
                transactionType: 'DEBIT',
                currencyCode: 'USD',
                transactionDate: FIXED_DATE.valueOf(),
                createdAt: FIXED_DATE.valueOf(),
                updatedAt: FIXED_DATE.valueOf(),
              },
            ];
          }
          if (tableName === 'journals') {
            expect(sql).toContain('deleted_at IS NULL');
            return [
              {
                id: 'j-active',
                journalDate: FIXED_DATE.valueOf(),
                currencyCode: 'USD',
                totalAmount: 10,
                transactionCount: 1,
                displayType: 'EXPENSE',
                status: 'POSTED',
                createdAt: FIXED_DATE.valueOf(),
                updatedAt: FIXED_DATE.valueOf(),
              },
            ];
          }
          if (tableName === 'accounts') {
            return [
              {
                id: 'acc1',
                name: 'Cash',
                accountType: 'ASSET',
                currencyCode: 'USD',
                createdAt: FIXED_DATE.valueOf(),
                updatedAt: FIXED_DATE.valueOf(),
              },
            ];
          }
          if (tableName === 'balance_snapshots') {
            return [
              {
                id: 'snap-active',
                accountId: 'acc1',
                transactionId: 't-active',
                transactionDate: FIXED_DATE.valueOf(),
                absoluteBalance: 10,
                transactionCount: 1,
                createdAt: FIXED_DATE.valueOf(),
                updatedAt: FIXED_DATE.valueOf(),
              },
              {
                id: 'snap-orphan',
                accountId: 'acc1',
                transactionId: 't-deleted',
                transactionDate: FIXED_DATE.valueOf(),
                absoluteBalance: 5,
                transactionCount: 1,
                createdAt: FIXED_DATE.valueOf(),
                updatedAt: FIXED_DATE.valueOf(),
              },
            ];
          }
          return [];
        },
      );

      mockGet.mockImplementation((tableName: string) => {
        if (tableName === 'workplaces') {
          return createCollectionMock([
            {
              id: 'wp-1',
              name: 'Personal',
              createdAt: FIXED_DATE,
              updatedAt: FIXED_DATE,
              defaultCurrencyCode: 'USD',
            },
          ]);
        }
        return createCollectionMock([]);
      });
      (preferences.loadPreferences as jest.Mock).mockResolvedValue({});

      await exportService.exportToJSON('wp-1' as WorkplaceId);
      const backupJson = (compression.createZipArchive as jest.Mock).mock.calls[0][1][
        'backup.json'
      ] as string;
      const parsed = JSON.parse(backupJson);

      expect(parsed.transactions.map((t: { id: string }) => t.id)).toEqual(['t-active']);
      expect(parsed.journals.map((j: { id: string }) => j.id)).toEqual(['j-active']);
      expect(parsed.balance_snapshots.map((s: { id: string }) => s.id)).toEqual(['snap-active']);

      (supportsRawSql as jest.Mock).mockReturnValue(false);
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
