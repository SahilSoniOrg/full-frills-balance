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

jest.mock('@/src/services/integrity-service', () => ({
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

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(),
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

import { importService } from '@/src/services/import/ImportService';
import { database } from '@/src/data/database/Database';
import { preImportBackupService } from '@/src/services/import/preImportBackupService';
import {
  commitStagedImport,
  createImportStagingWorkplace,
  discardImportStagingWorkplace,
} from '@/src/services/import/importStaging';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { currencyInitService } from '@/src/services/currency-init-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { integrityService } from '@/src/services/integrity-service';
import { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import { preferences } from '@/src/utils/preferences';
import { WorkplaceId } from '@/src/types/domain';

function createMockPlugin(overrides?: Partial<ImportPlugin>): ImportPlugin {
  return {
    id: 'test',
    name: 'Test',
    description: 'Test plugin',
    icon: 'T',
    detect: () => true,
    parse: jest.fn().mockResolvedValue({
      data: {
        accounts: [{ id: 'account-1', name: 'Cash', accountType: 'ASSET', currencyCode: 'USD' }],
        journals: [],
        transactions: [],
      },
      stats: {
        accounts: 1,
        journals: 0,
        transactions: 0,
        skippedTransactions: 0,
      },
    }),
    ...overrides,
  };
}

describe('ImportService import workflow (public executeImport contract)', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const context = {
    uri: 'file://x',
    name: 'x.json',
    rawBytes: new Uint8Array(),
  } as ImportFileContext;
  const mockAccountFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountFetch.mockResolvedValue([]);
    (database.collections.get as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({ defaultCurrencyCode: 'USD' }),
      query: jest.fn().mockReturnValue({ fetch: mockAccountFetch }),
    });
    (preImportBackupService.createBackup as jest.Mock).mockResolvedValue({ skipped: true });
    (importRepository.batchInsert as jest.Mock).mockResolvedValue(true);
    (integrityService.forceRunCheck as jest.Mock).mockResolvedValue({});
  });

  it('runs phases in safety order: parse → backup → stage → init → insert → staging integrity → swap → rates → post-swap integrity/rebuild', async () => {
    const phaseOrder: string[] = [];
    const plugin = createMockPlugin({
      parse: jest.fn().mockImplementation(async () => {
        phaseOrder.push('parse');
        return {
          data: {
            accounts: [
              { id: 'account-1', name: 'Cash', accountType: 'ASSET', currencyCode: 'EUR' },
            ],
            journals: [],
            transactions: [],
          },
          stats: { accounts: 1, journals: 0, transactions: 0, skippedTransactions: 0 },
        };
      }),
    });

    (preImportBackupService.createBackup as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('backup');
      return { skipped: true };
    });
    (createImportStagingWorkplace as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('stage');
      return 'staging-wp';
    });
    (currencyInitService.initialize as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('init');
    });
    (importRepository.batchInsert as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('insert');
    });
    (integrityService.forceRunCheck as jest.Mock).mockImplementation(async (wpId: string) => {
      phaseOrder.push(wpId === 'staging-wp' ? 'staging_integrity' : 'post_integrity');
      return {};
    });
    (commitStagedImport as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('swap');
    });
    (exchangeRateService.syncTodayRates as jest.Mock).mockImplementation(async () => {
      if (!phaseOrder.includes('rates')) {
        phaseOrder.push('rates');
      }
    });

    await importService.executeImport(plugin, context, workplaceId);

    expect(phaseOrder).toEqual([
      'parse',
      'backup',
      'stage',
      'init',
      'insert',
      'staging_integrity',
      'swap',
      'rates',
      'post_integrity',
    ]);
  });

  it('reports monotonically non-decreasing progress values', async () => {
    const plugin = createMockPlugin();
    const progressValues: number[] = [];

    await importService.executeImport(plugin, context, workplaceId, (_message, progress) => {
      if (progress !== undefined) {
        progressValues.push(progress);
      }
    });

    expect(progressValues.length).toBeGreaterThan(1);
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]!);
    }
    expect(progressValues[progressValues.length - 1]).toBe(1);
  });

  it('creates backup before staging or batch insert', async () => {
    const plugin = createMockPlugin();
    let backupFinished = false;
    (preImportBackupService.createBackup as jest.Mock).mockImplementation(async () => {
      expect(createImportStagingWorkplace).not.toHaveBeenCalled();
      expect(importRepository.batchInsert).not.toHaveBeenCalled();
      backupFinished = true;
      return { path: 'file:///backup.zip' };
    });
    (createImportStagingWorkplace as jest.Mock).mockImplementation(async () => {
      expect(backupFinished).toBe(true);
      return 'staging-wp';
    });

    await importService.executeImport(plugin, context, workplaceId);

    expect(preImportBackupService.createBackup).toHaveBeenCalled();
  });

  it('runs staging integrity check before workplace swap', async () => {
    const plugin = createMockPlugin();
    let swapStarted = false;

    (integrityService.forceRunCheck as jest.Mock).mockImplementation(async (wpId: string) => {
      if (wpId === 'staging-wp') {
        expect(swapStarted).toBe(false);
      }
      return {};
    });
    (commitStagedImport as jest.Mock).mockImplementation(async () => {
      swapStarted = true;
    });

    await importService.executeImport(plugin, context, workplaceId);

    const integrityMock = integrityService.forceRunCheck as jest.Mock;
    const stagingCheckIndex = integrityMock.mock.calls.findIndex(([wpId]) => wpId === 'staging-wp');
    const swapIndex = (commitStagedImport as jest.Mock).mock.invocationCallOrder[0];
    const stagingCheckOrder = integrityMock.mock.invocationCallOrder[stagingCheckIndex];
    expect(stagingCheckOrder).toBeLessThan(swapIndex!);
  });

  it('discards staging and does not swap when staging integrity fails', async () => {
    const plugin = createMockPlugin();
    (integrityService.forceRunCheck as jest.Mock).mockImplementation(async (wpId: string) => {
      if (wpId === 'staging-wp') {
        throw new Error('Staging integrity failed');
      }
      return {};
    });

    await expect(importService.executeImport(plugin, context, workplaceId)).rejects.toThrow(
      'Staging integrity failed',
    );

    expect(discardImportStagingWorkplace).toHaveBeenCalledWith('staging-wp');
    expect(commitStagedImport).not.toHaveBeenCalled();
  });

  it('rebuilds account balances after swap when accounts exist', async () => {
    const plugin = createMockPlugin();
    const account = { name: 'Checking', id: 'acc-1' };
    mockAccountFetch.mockResolvedValue([account]);

    await importService.executeImport(plugin, context, workplaceId);

    expect(commitStagedImport).toHaveBeenCalledWith(workplaceId, 'staging-wp');
    expect(rebuildAllAccountBalancesAfterImport).toHaveBeenCalledWith(
      workplaceId,
      [account],
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('restores preferences and activates workplace after successful import', async () => {
    const plugin = createMockPlugin({
      parse: jest.fn().mockResolvedValue({
        data: { accounts: [], journals: [], transactions: [] },
        stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
        preferences: {
          theme: 'dark',
          defaultCurrencyCode: 'USD',
          activeWorkplaceId: 'backup-workplace',
        },
      }),
    });

    await importService.executeImport(plugin, context, workplaceId);

    expect(preferences.restorePreferences).toHaveBeenCalledWith({ theme: 'dark' });
    expect(preferences.setActiveWorkplaceId).toHaveBeenCalledWith(workplaceId);
    expect(preferences.setOnboardingCompleted).toHaveBeenCalledWith(true);
  });

  it('completes when exchange rate sync fails for a currency', async () => {
    const plugin = createMockPlugin();
    (exchangeRateService.syncTodayRates as jest.Mock).mockRejectedValue(new Error('Rate API down'));

    await expect(importService.executeImport(plugin, context, workplaceId)).resolves.toMatchObject({
      accounts: 1,
    });
  });

  it('completes when post-import balance rebuild fails', async () => {
    const plugin = createMockPlugin();
    mockAccountFetch.mockResolvedValue([{ name: 'Savings', id: 'acc-2' }]);
    (rebuildAllAccountBalancesAfterImport as jest.Mock).mockRejectedValue(
      new Error('Rebuild failed'),
    );

    await expect(importService.executeImport(plugin, context, workplaceId)).resolves.toMatchObject({
      accounts: 1,
    });
  });
});
