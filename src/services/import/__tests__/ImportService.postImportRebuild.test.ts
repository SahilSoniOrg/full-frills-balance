/* eslint-disable import/first -- jest mocks must be hoisted before imports */

jest.mock('@/src/services/import/preImportBackupService', () => ({
  preImportBackupService: {
    createBackup: jest.fn().mockResolvedValue({ skipped: true }),
  },
}));

jest.mock('@/src/data/repositories/ImportRepository', () => ({
  importRepository: {
    batchInsert: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/src/services/integrity', () => ({
  integrityService: {
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

jest.mock('@/src/services/ReactiveDataService', () => ({
  reactiveDataService: {
    clearCache: jest.fn(),
  },
}));

jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: {
    clearSnapshotsForWorkplace: jest.fn(),
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

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    updateWorkplace: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/src/services/import/importStaging', () => ({
  createImportStagingWorkplace: jest.fn().mockResolvedValue('staging-wp'),
  commitStagedImport: jest.fn().mockResolvedValue(undefined),
  discardImportStagingWorkplace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/services/import/importAccountBalanceRebuild', () => ({
  rebuildAllAccountBalancesAfterImport: jest.fn().mockResolvedValue(undefined),
}));

import { canonicalImportFromBatchImportData } from '@/src/services/import/canonicalImportAdapter';
import { importService } from '@/src/services/import/ImportService';
import { database } from '@/src/data/database/Database';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { snapshotService } from '@/src/utils/SnapshotService';
import { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import { WorkplaceId } from '@/src/types/ids';

const mockPlugin: ImportPlugin = {
  id: 'test',
  name: 'Test',
  description: 'Test plugin',
  icon: 'T',
  detect: () => true,
  parse: jest.fn().mockResolvedValue({
    canonical: canonicalImportFromBatchImportData({
      accounts: [],
      journals: [],
      transactions: [],
    }),
    stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
  }),
};

describe('ImportService post-import wiring', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const context = {
    uri: 'file://x',
    name: 'x.json',
    rawBytes: new Uint8Array(),
  } as ImportFileContext;

  beforeEach(() => {
    jest.clearAllMocks();
    (rebuildAllAccountBalancesAfterImport as jest.Mock).mockResolvedValue(undefined);
  });

  it('does not call rebuild helper when fetched account list is empty', async () => {
    await importService.executeImport(mockPlugin, context, workplaceId);
    expect(rebuildAllAccountBalancesAfterImport).not.toHaveBeenCalled();
  });

  it('invalidates account caches and snapshots after replacing the workplace', async () => {
    const account = { id: 'imported-account', name: 'Imported account' };
    const collectionsGet = database.collections.get as jest.Mock;
    collectionsGet.mockReturnValueOnce({
      find: jest.fn().mockResolvedValue({ defaultCurrencyCode: 'USD' }),
    });
    collectionsGet.mockReturnValueOnce({
      query: jest.fn().mockReturnValue({ fetch: jest.fn().mockResolvedValue([account]) }),
    });

    await importService.executeImport(mockPlugin, context, workplaceId);

    expect(reactiveDataService.clearCache).toHaveBeenCalledWith(workplaceId);
    expect(snapshotService.clearSnapshotsForWorkplace).toHaveBeenCalledWith(workplaceId);
    expect(rebuildAllAccountBalancesAfterImport).toHaveBeenCalledWith(
      workplaceId,
      [account],
      expect.any(Number),
      expect.any(Function),
    );
  });
});
