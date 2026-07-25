/* eslint-disable import/first -- jest mocks must be hoisted before imports */

let mockAccounts: { id: string; name: string }[] = [];

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn(() => ({})),
  },
}));

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
      get: jest.fn((table: string) => {
        if (table === 'workplaces') {
          return {
            find: jest.fn().mockResolvedValue({ defaultCurrencyCode: 'USD' }),
          };
        }
        if (table === 'accounts') {
          return {
            query: jest.fn().mockReturnValue({
              fetch: jest.fn().mockImplementation(async () => mockAccounts),
            }),
          };
        }
        return {
          find: jest.fn(),
          query: jest.fn().mockReturnValue({ fetch: jest.fn().mockResolvedValue([]) }),
        };
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

jest.mock('@/src/services/AccountingRebuildService', () => ({
  accountingRebuildService: {
    rebuildAccountBalances: jest.fn(),
  },
}));

import { AppConfig } from '@/src/constants/app-config';
import { importService } from '@/src/services/import/ImportService';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { ImportFileContext, ImportPlugin } from '@/src/services/import/types';
import { WorkplaceId } from '@/src/types/domain';

const mockPlugin: ImportPlugin = {
  id: 'test',
  name: 'Test',
  description: 'Test plugin',
  icon: 'T',
  detect: () => true,
  parse: jest.fn().mockResolvedValue({
    data: {
      accounts: [{ id: 'a1', name: 'Cash' }],
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
};

describe('ImportService post-import balance rebuild', () => {
  const workplaceId = 'wp-1' as WorkplaceId;
  const context = {
    uri: 'file://x',
    name: 'x.json',
    rawBytes: new Uint8Array(),
  } as ImportFileContext;

  const rebuildMock = accountingRebuildService.rebuildAccountBalances as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccounts = Array.from({ length: 6 }, (_, i) => ({
      id: `acc-${i}`,
      name: `Account ${i}`,
    }));
    rebuildMock.mockResolvedValue(undefined);
  });

  it('rebuilds every imported account after integrity check', async () => {
    await importService.executeImport(mockPlugin, context, workplaceId);

    expect(rebuildMock).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 6; i++) {
      expect(rebuildMock).toHaveBeenCalledWith(workplaceId, `acc-${i}`);
    }
  });

  it('limits concurrent rebuilds to configured concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const limit = AppConfig.performance.import.postImportAccountRebuildConcurrency;

    rebuildMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 30));
      inFlight -= 1;
    });

    await importService.executeImport(mockPlugin, context, workplaceId);

    expect(rebuildMock).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBeLessThanOrEqual(limit);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('reports rebuild progress messages', async () => {
    const messages: string[] = [];
    await importService.executeImport(mockPlugin, context, workplaceId, message => {
      messages.push(message);
    });

    expect(messages.some(m => m.includes('Rebuilding checkpoints'))).toBe(true);
    expect(messages.some(m => m.includes('6/6'))).toBe(true);
  });

  it('skips rebuild when workplace has no accounts', async () => {
    mockAccounts = [];
    await importService.executeImport(mockPlugin, context, workplaceId);
    expect(rebuildMock).not.toHaveBeenCalled();
  });
});
