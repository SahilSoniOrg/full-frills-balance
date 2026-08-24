/* eslint-disable import/first -- jest mocks must be hoisted before imports */
jest.mock('@/src/services/import/preImportBackupService', () => ({
  preImportBackupService: {
    createBackup: jest.fn(),
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

import { canonicalImportFromBatchImportData } from '@/src/services/import/canonicalImportAdapter';
import { importService } from '@/src/services/import/ImportService';
import { preImportBackupService } from '@/src/services/import/preImportBackupService';
import {
  commitStagedImport,
  discardImportStagingWorkplace,
} from '@/src/services/import/importStaging';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import { integrityService } from '@/src/services/integrity';
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
    stats: {
      accounts: 0,
      journals: 0,
      transactions: 0,
      skippedTransactions: 0,
    },
  }),
};

describe('ImportService pre-import backup', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const context = {
    uri: 'file://x',
    name: 'x.json',
    rawBytes: new Uint8Array(),
  } as ImportFileContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs backup before wipe and returns backup path in stats', async () => {
    const backupPath = 'file:///docs/pre-import-backups/pre-import-wp-1.zip';
    (preImportBackupService.createBackup as jest.Mock).mockResolvedValue({ path: backupPath });

    const stats = await importService.executeImport(mockPlugin, context, workplaceId);

    expect(preImportBackupService.createBackup).toHaveBeenCalledWith(
      workplaceId,
      expect.any(Function),
    );
    expect(commitStagedImport).toHaveBeenCalledWith(workplaceId, 'staging-wp');
    expect(integrityService.resetWorkplace).not.toHaveBeenCalled();
    expect(stats.preImportBackupPath).toBe(backupPath);
  });

  it('aborts import when backup fails and does not wipe', async () => {
    (preImportBackupService.createBackup as jest.Mock).mockRejectedValue(new Error('Disk full'));

    await expect(importService.executeImport(mockPlugin, context, workplaceId)).rejects.toThrow(
      'Disk full',
    );

    expect(integrityService.resetWorkplace).not.toHaveBeenCalled();
    expect(commitStagedImport).not.toHaveBeenCalled();
  });

  it('discards staging and does not swap when insert fails', async () => {
    (preImportBackupService.createBackup as jest.Mock).mockResolvedValue({ skipped: true });
    (importRepository.batchInsert as jest.Mock).mockRejectedValueOnce(new Error('Insert failed'));

    await expect(importService.executeImport(mockPlugin, context, workplaceId)).rejects.toThrow(
      'Insert failed',
    );

    expect(discardImportStagingWorkplace).toHaveBeenCalledWith('staging-wp');
    expect(commitStagedImport).not.toHaveBeenCalled();
    expect(integrityService.resetWorkplace).not.toHaveBeenCalled();
  });

  it('reports progress with backup saved message', async () => {
    const backupPath = 'file:///docs/pre-import-backups/safety.zip';
    (preImportBackupService.createBackup as jest.Mock).mockImplementation(
      async (_id, onProgress) => {
        onProgress?.(`Safety backup saved: ${backupPath}`, 1);
        return { path: backupPath };
      },
    );

    const messages: string[] = [];
    await importService.executeImport(mockPlugin, context, workplaceId, message => {
      messages.push(message);
    });

    expect(messages.some(m => m.includes('Safety backup saved'))).toBe(true);
  });
});
