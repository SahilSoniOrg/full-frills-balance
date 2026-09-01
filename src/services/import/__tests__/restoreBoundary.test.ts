/* eslint-disable import/first -- dependency doubles must be registered before imports. */
jest.mock('@/src/data/repositories/ImportRepository', () => ({
  importRepository: { batchInsertNewWorkplace: jest.fn() },
}));
jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: { find: jest.fn() },
}));
jest.mock('@/src/services/currency-init-service', () => ({
  currencyInitService: { initialize: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: { syncTodayRates: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/integrity', () => ({
  integrityService: { forceRunCheck: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/services/import/importAccountBalanceRebuild', () => ({
  rebuildAllAccountBalancesAfterImport: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/services/import/restorePublicationClaims', () => ({
  restorePublicationClaims: { claim: jest.fn() },
}));
jest.mock('@/src/services/ReactiveDataService', () => ({
  reactiveDataService: { clearCache: jest.fn() },
}));
jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: { clearSnapshotsForWorkplace: jest.fn() },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    workplace: { replace: jest.fn() },
    restorePreferences: jest.fn(),
    restoreImportedPreferences: jest.fn(),
    device: {
      setDeviceRegistered: jest.fn(),
      setActiveWorkplaceId: jest.fn(),
    },
  },
}));
jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(() => ({ query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue([]) })) })),
    },
  },
}));

import { canonicalImportFromBatchImportData } from '@/src/services/import/canonicalImportAdapter';
import { prepareRestore, fingerprintRestoreSource } from '@/src/services/import/prepareRestore';
import { publishRestore } from '@/src/services/import/publishRestore';
import { restorePublicationClaims } from '@/src/services/import/restorePublicationClaims';
import { FontIds, ThemeIds } from '@/src/constants/design-tokens';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { database } from '@/src/data/database/Database';
import { preferences } from '@/src/services/preferences';
import type { ImportPlugin } from '@/src/services/import/types';
import type { PreparedRestore } from '@/src/services/import/restoreTypes';
import type { WorkplaceId } from '@/src/types/ids';

const operationId = 'restore-operation' as WorkplaceId;
const context = {
  uri: 'file:///backup.json',
  name: 'backup.json',
  rawBytes: new Uint8Array([1, 2, 3]),
};

function plugin(result: Record<string, unknown> = {}): ImportPlugin {
  return {
    id: 'test',
    name: 'Test backup',
    description: 'test',
    icon: 'T',
    detect: () => true,
    parse: jest.fn().mockResolvedValue({
      canonical: canonicalImportFromBatchImportData({
        accounts: [],
        journals: [],
        transactions: [],
      }),
      stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
      ...result,
    }),
  };
}

function prepared(overrides: Partial<PreparedRestore> = {}): PreparedRestore {
  return {
    fingerprint: 'restore-v1:test',
    canonicalData: canonicalImportFromBatchImportData({
      accounts: [],
      journals: [],
      transactions: [],
    }),
    facts: {
      user: { name: 'Backup User' },
      workplace: { name: 'Imported Books', icon: 'briefcase', defaultCurrencyCode: 'USD' },
    },
    stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
    warnings: [],
    ...overrides,
  };
}

describe('restore service boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (workplaceRepository.find as jest.Mock).mockResolvedValue(undefined);
    (importRepository.batchInsertNewWorkplace as jest.Mock).mockResolvedValue(undefined);
  });

  it('prepares canonical facts without writing preferences or database rows', async () => {
    const result = await prepareRestore(
      plugin({
        preferences: {
          userName: '  Backup User ',
          theme: 'dark',
          themeId: ThemeIds.DEEP_SPACE,
          fontId: FontIds.IVY,
        },
        workplace: { name: ' Books ', icon: 'briefcase', defaultCurrencyCode: 'usd' },
        workplacePreferences: { safeToSpendDays: 60 },
      }),
      context,
    );

    expect(result.fingerprint).toBe(fingerprintRestoreSource(context.rawBytes));
    expect(result.facts).toMatchObject({
      user: { name: 'Backup User' },
      workplace: { name: 'Books', icon: 'briefcase', defaultCurrencyCode: 'USD' },
      appearance: { theme: 'dark', themeId: ThemeIds.DEEP_SPACE, fontId: FontIds.IVY },
      workplacePreferences: { safeToSpendDays: 60 },
    });
    expect(preferences.restoreImportedPreferences).not.toHaveBeenCalled();
    expect(preferences.workplace.replace).not.toHaveBeenCalled();
    expect(database.collections.get).not.toHaveBeenCalled();
  });

  it('publishes atomically under the operation ID without activating or restoring User preferences', async () => {
    (importRepository.batchInsertNewWorkplace as jest.Mock).mockResolvedValue({
      id: operationId,
      name: 'Imported Books',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });
    await publishRestore(prepared(), {
      operationId,
      corrections: { name: 'Imported Books', icon: 'briefcase', defaultCurrencyCode: 'USD' },
    });

    expect(importRepository.batchInsertNewWorkplace).toHaveBeenCalledTimes(1);
    expect(importRepository.batchInsertNewWorkplace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: operationId,
        name: 'Imported Books',
        defaultCurrencyCode: 'USD',
      }),
      expect.anything(),
      expect.any(Function),
    );
    expect(preferences.restoreImportedPreferences).not.toHaveBeenCalled();
    expect(preferences.device.setDeviceRegistered).not.toHaveBeenCalled();
    expect(preferences.device.setActiveWorkplaceId).not.toHaveBeenCalled();
  });

  it('does not publish twice when the operation ID already owns a Workplace', async () => {
    (workplaceRepository.find as jest.Mock).mockResolvedValue({
      id: operationId,
      name: 'Imported Books',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });

    const result = await publishRestore(prepared(), {
      operationId,
      corrections: { name: 'Imported Books', icon: 'briefcase', defaultCurrencyCode: 'USD' },
    });

    expect(importRepository.batchInsertNewWorkplace).not.toHaveBeenCalled();
    expect(result.workplaceId).toBe(operationId);
  });

  it('reuses the same operation-owned Workplace after the first publish', async () => {
    let published:
      | {
          id: WorkplaceId;
          name: string;
          icon: string;
          defaultCurrencyCode: string;
        }
      | undefined;
    (workplaceRepository.find as jest.Mock).mockImplementation(async () => published);
    (importRepository.batchInsertNewWorkplace as jest.Mock).mockImplementation(async input => {
      published = input;
      return input;
    });

    await publishRestore(prepared(), {
      operationId,
      corrections: { name: 'Imported Books', icon: 'briefcase', defaultCurrencyCode: 'USD' },
    });
    await publishRestore(prepared(), {
      operationId,
      corrections: { name: 'Imported Books', icon: 'briefcase', defaultCurrencyCode: 'USD' },
    });

    expect(importRepository.batchInsertNewWorkplace).toHaveBeenCalledTimes(1);
  });

  it('rejects an operation ID when the prepared source fingerprint changed', async () => {
    (restorePublicationClaims.claim as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Restore operation ID is already owned by a different backup source');
    });
    (workplaceRepository.find as jest.Mock).mockResolvedValue({
      id: operationId,
      name: 'Imported Books',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });

    await expect(
      publishRestore(prepared({ fingerprint: 'restore-v1:different' }), {
        operationId,
        corrections: { name: 'Imported Books', icon: 'briefcase', defaultCurrencyCode: 'USD' },
      }),
    ).rejects.toThrow('different backup source');
    expect(workplaceRepository.find).not.toHaveBeenCalled();
    expect(importRepository.batchInsertNewWorkplace).not.toHaveBeenCalled();
  });

  it('rejects missing publication facts instead of inventing them', async () => {
    await expect(
      publishRestore(prepared(), {
        operationId,
        corrections: { name: '', icon: 'briefcase', defaultCurrencyCode: 'USD' },
      }),
    ).rejects.toThrow('Workplace name');
    expect(importRepository.batchInsertNewWorkplace).not.toHaveBeenCalled();
  });
});
