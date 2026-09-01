import { asWorkplaceId } from '@/src/types/ids';
import { workplaceService } from '@/src/services/WorkplaceService';
import { preferences } from '@/src/utils/preferences';
import { discardPublishedRestore, finishSetup } from '../setupFinishers';
import type { RestoreSetupDraft, WorkplaceSetupOutput } from '../setupTypes';

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getWorkplace: jest.fn(),
    updateWorkplace: jest.fn(),
    deleteWorkplace: jest.fn(),
    createWorkplace: jest.fn(),
  },
}));

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    setUserName: jest.fn(),
    device: {
      activeWorkplaceId: undefined as string | undefined,
      setDeviceRegistered: jest.fn(),
      setActiveWorkplaceId: jest.fn(),
    },
    themePrefs: {
      setThemeId: jest.fn(),
      setFontId: jest.fn(),
    },
  },
}));

const operationId = asWorkplaceId('operation');
const workplace: WorkplaceSetupOutput = {
  name: { value: 'Edited', source: 'user_entered' },
  icon: { value: 'home', source: 'user_entered' },
  baseCurrency: { value: 'EUR', source: 'imported' },
  selectedAccounts: [],
  selectedCategories: [],
  acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
};

function restoreDraft(): RestoreSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'restore',
    journeyId: 'empty_device_restore',
    entryPolicy: 'blocking',
    operationId,
    presentedHistory: ['restore_source', 'restore_summary'],
    acceptedSlices: ['restore_source', 'workplace', 'restore_summary'],
    restore: {
      source: {
        source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
        facts: { workplace: { name: 'Books' } },
      },
      handoff: {
        operationId,
        workplaceId: operationId,
        fingerprint: 'abc',
        facts: { workplace: { name: 'Books' } },
        stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
        warnings: [],
      },
      summary: { intent: 'open' },
    },
    workplace,
  };
}

describe('restore finishers', () => {
  const getWorkplace = workplaceService.getWorkplace as jest.Mock;
  const updateWorkplace = workplaceService.updateWorkplace as jest.Mock;
  const deleteWorkplace = workplaceService.deleteWorkplace as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (preferences.device as { activeWorkplaceId?: string }).activeWorkplaceId = undefined;
  });

  it('rejects restore finish when the published Workplace is missing', async () => {
    getWorkplace.mockResolvedValue(undefined);
    await expect(finishSetup(restoreDraft())).rejects.toThrow('Restore publication is incomplete');
    expect(preferences.device.setActiveWorkplaceId).not.toHaveBeenCalled();
  });

  it('applies identity edits and activates the verified Workplace', async () => {
    getWorkplace.mockResolvedValue({
      id: operationId,
      name: 'Books',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });
    await expect(finishSetup(restoreDraft())).resolves.toBe(operationId);
    expect(updateWorkplace).toHaveBeenCalledWith(operationId, { name: 'Edited', icon: 'home' });
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith(operationId);
  });

  it('deletes only an operation-owned inactive Workplace', async () => {
    getWorkplace.mockResolvedValue({
      id: operationId,
      name: 'Books',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });
    await discardPublishedRestore(restoreDraft());
    expect(deleteWorkplace).toHaveBeenCalledWith(operationId);

    deleteWorkplace.mockClear();
    (preferences.device as { activeWorkplaceId?: string }).activeWorkplaceId = operationId;
    await discardPublishedRestore(restoreDraft());
    expect(deleteWorkplace).not.toHaveBeenCalled();
  });
});
