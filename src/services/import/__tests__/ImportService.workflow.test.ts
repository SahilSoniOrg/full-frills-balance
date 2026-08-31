/* eslint-disable import/first -- jest mocks must be hoisted before imports */
jest.mock('@/src/services/import/preImportBackupService', () => ({
  preImportBackupService: {
    createBackup: jest.fn().mockResolvedValue({ skipped: true }),
  },
}));

jest.mock('@/src/data/repositories/ImportRepository', () => ({
  importRepository: {
    batchInsert: jest.fn().mockResolvedValue(true),
    replaceWorkplace: jest.fn().mockResolvedValue(true),
    batchInsertNewWorkplace: jest.fn().mockResolvedValue({ id: 'staging-wp' }),
  },
}));

jest.mock('@/src/services/integrity', () => ({
  integrityService: {
    forceRunCheck: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    restoreImportedPreferences: jest.fn(),
    device: {
      setActiveWorkplaceId: jest.fn(),
      setDeviceRegistered: jest.fn(),
      setOnboardingStage: jest.fn(),
      setOnboardingCompleted: jest.fn(),
      setPendingWorkplaceId: jest.fn(),
    },
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
    getWorkplace: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/services/import/importAccountBalanceRebuild', () => ({
  rebuildAllAccountBalancesAfterImport: jest.fn().mockResolvedValue(undefined),
}));

import { canonicalImportFromBatchImportData } from '@/src/services/import/canonicalImportAdapter';
import { importService } from '@/src/services/import/ImportService';
import { database } from '@/src/data/database/Database';
import { preImportBackupService } from '@/src/services/import/preImportBackupService';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { currencyInitService } from '@/src/services/currency-init-service';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { integrityService } from '@/src/services/integrity';
import { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import { preferences } from '@/src/utils/preferences';
import { WorkplaceId } from '@/src/types/ids';
import { workplaceService } from '@/src/services/WorkplaceService';

function createMockPlugin(overrides?: Partial<ImportPlugin>): ImportPlugin {
  return {
    id: 'test',
    name: 'Test',
    description: 'Test plugin',
    icon: 'T',
    detect: () => true,
    parse: jest.fn().mockResolvedValue({
      canonical: canonicalImportFromBatchImportData({
        accounts: [{ id: 'account-1', name: 'Cash', accountType: 'ASSET', currencyCode: 'USD' }],
        journals: [],
        transactions: [],
      }),
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

  it('runs phases in safety order: parse → backup → init → rates → post-import integrity/rebuild', async () => {
    const phaseOrder: string[] = [];
    const plugin = createMockPlugin({
      parse: jest.fn().mockImplementation(async () => {
        phaseOrder.push('parse');
        return {
          canonical: canonicalImportFromBatchImportData({
            accounts: [
              { id: 'account-1', name: 'Cash', accountType: 'ASSET', currencyCode: 'EUR' },
            ],
            journals: [],
            transactions: [],
          }),
          stats: { accounts: 1, journals: 0, transactions: 0, skippedTransactions: 0 },
        };
      }),
    });

    (preImportBackupService.createBackup as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('backup');
      return { skipped: true };
    });
    (currencyInitService.initialize as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('init');
    });
    (importRepository.replaceWorkplace as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('insert');
    });
    (integrityService.forceRunCheck as jest.Mock).mockImplementation(async () => {
      phaseOrder.push('post_integrity');
      return {};
    });
    (exchangeRateService.syncTodayRates as jest.Mock).mockImplementation(async () => {
      if (!phaseOrder.includes('rates')) {
        phaseOrder.push('rates');
      }
    });

    await importService.executeImport(plugin, context, workplaceId);

    expect(phaseOrder).toEqual(['parse', 'backup', 'init', 'insert', 'rates', 'post_integrity']);
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

  it('creates backup before the atomic replacement', async () => {
    const plugin = createMockPlugin();
    let backupFinished = false;
    (preImportBackupService.createBackup as jest.Mock).mockImplementation(async () => {
      expect(importRepository.replaceWorkplace).not.toHaveBeenCalled();
      backupFinished = true;
      return { path: 'file:///backup.zip' };
    });
    (importRepository.replaceWorkplace as jest.Mock).mockImplementation(async () => {
      expect(backupFinished).toBe(true);
    });

    await importService.executeImport(plugin, context, workplaceId);

    expect(preImportBackupService.createBackup).toHaveBeenCalled();
  });

  it('rebuilds account balances after atomic replacement when accounts exist', async () => {
    const plugin = createMockPlugin();
    const account = { name: 'Checking', id: 'acc-1' };
    mockAccountFetch.mockResolvedValue([account]);

    await importService.executeImport(plugin, context, workplaceId);

    expect(importRepository.replaceWorkplace).toHaveBeenCalledWith(
      workplaceId,
      expect.anything(),
      expect.any(Function),
      undefined,
    );
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
        canonical: canonicalImportFromBatchImportData({
          accounts: [],
          journals: [],
          transactions: [],
        }),
        stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
        preferences: {
          theme: 'dark',
          isAppLockEnabled: true,
          defaultCurrencyCode: 'USD',
          activeWorkplaceId: 'backup-workplace',
        },
      }),
    });

    await importService.executeImport(plugin, context, workplaceId);

    expect(preferences.restoreImportedPreferences).toHaveBeenCalledWith(
      {
        theme: 'dark',
        isAppLockEnabled: true,
        activeWorkplaceId: 'backup-workplace',
      },
      workplaceId,
      'workplace',
    );
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith(workplaceId);
    expect(preferences.device.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('publishes a target-less import as one atomic Workplace transaction', async () => {
    const order: string[] = [];
    const plugin = createMockPlugin({
      parse: jest.fn().mockResolvedValue({
        canonical: canonicalImportFromBatchImportData({
          accounts: [],
          journals: [],
          transactions: [],
        }),
        stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
        workplace: { name: 'Restored ledger', icon: 'wallet', defaultCurrencyCode: 'EUR' },
      }),
    });
    (importRepository.batchInsertNewWorkplace as jest.Mock).mockImplementationOnce(async () => {
      order.push('publish');
      return { id: 'staging-wp' };
    });
    (integrityService.forceRunCheck as jest.Mock).mockImplementation(async () => {
      order.push('post-publish-check');
      return {};
    });

    await importService.executeImport(plugin, context);

    expect(preImportBackupService.createBackup).not.toHaveBeenCalled();
    expect(importRepository.batchInsertNewWorkplace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Restored ledger',
        icon: 'wallet',
        defaultCurrencyCode: 'EUR',
      }),
      expect.anything(),
      expect.any(Function),
    );
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith(expect.any(String));
    expect(order).toEqual(['publish', 'post-publish-check']);
  });

  it('can publish a Workplace without activating it during onboarding', async () => {
    await importService.executeImport(createMockPlugin(), context, undefined, undefined, {
      operationId: 'onboarding-import' as WorkplaceId,
      deferActivation: true,
    });

    expect(preferences.device.setActiveWorkplaceId).not.toHaveBeenCalled();
    expect(preferences.device.setDeviceRegistered).not.toHaveBeenCalled();
    expect(preferences.device.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('does not duplicate a target-less restore when its published operation is retried', async () => {
    const operationId = 'restore-operation' as WorkplaceId;
    (workplaceService.getWorkplace as jest.Mock).mockResolvedValueOnce({
      id: operationId,
      defaultCurrencyCode: 'USD',
    });

    await importService.executeImport(createMockPlugin(), context, undefined, undefined, {
      operationId,
    });

    expect(importRepository.batchInsert).not.toHaveBeenCalled();
    expect(importRepository.batchInsertNewWorkplace).not.toHaveBeenCalled();
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith(operationId);
  });

  it('preserves a target-less publication when the commit reports an uncertain failure', async () => {
    let publicationCommitted = false;
    (workplaceService.getWorkplace as jest.Mock).mockImplementation(async () =>
      publicationCommitted ? { id: 'staging-wp' } : undefined,
    );
    (importRepository.batchInsertNewWorkplace as jest.Mock).mockImplementationOnce(async () => {
      publicationCommitted = true;
      throw new Error('Import commit response timed out');
    });

    await expect(
      importService.executeImport(createMockPlugin(), context, undefined, undefined, {
        operationId: 'staging-wp' as WorkplaceId,
      }),
    ).rejects.toThrow('Import commit response timed out');
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

  it('keeps a committed import successful when preference restoration fails', async () => {
    const plugin = createMockPlugin({
      parse: jest.fn().mockResolvedValue({
        canonical: canonicalImportFromBatchImportData({
          accounts: [],
          journals: [],
          transactions: [],
        }),
        stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
        preferences: { theme: 'dark' },
      }),
    });
    (preferences.restoreImportedPreferences as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Preference storage unavailable');
    });

    await expect(importService.executeImport(plugin, context, workplaceId)).resolves.toMatchObject({
      accounts: 0,
    });
    expect(importRepository.replaceWorkplace).toHaveBeenCalled();
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith(workplaceId);
  });
});
