import { asWorkplaceId } from '@/src/types/ids';
import { workplaceService } from '@/src/services/WorkplaceService';
import { preferences } from '@/src/services/preferences';
import {
  discardPublishedRestore,
  discardRestorePublication,
  finishSetup,
  finishWorkplaceSetup,
  loadRestoreSummary,
  loadRestoreSummaries,
} from '../setupFinishers';
import type { RestoreSetupDraft, WorkplaceSetupOutput } from '../setupTypes';

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getWorkplace: jest.fn(),
    updateWorkplace: jest.fn(),
    deleteWorkplace: jest.fn(),
    createWorkplace: jest.fn(),
    getAllWorkplaces: jest.fn(),
    getPublishedBookStats: jest.fn(),
  },
}));

jest.mock('@/src/services/import/restorePublicationClaims', () => ({
  restorePublicationClaims: {
    fingerprintFor: jest.fn(() => 'abc'),
  },
}));

jest.mock('@/src/services/preferences', () => ({
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
      sources: [
        {
          source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
          facts: { workplace: { name: 'Books' } },
        },
      ],
      handoffs: [
        {
          operationId,
          workplaceId: operationId,
          fingerprint: 'abc',
          facts: { workplace: { name: 'Books' } },
          stats: { accounts: 1, journals: 1, transactions: 1, skippedTransactions: 0 },
          warnings: [],
        },
      ],
      summary: { intent: 'open' },
    },
    workplace,
  };
}

describe('restore finishers', () => {
  const getWorkplace = workplaceService.getWorkplace as jest.Mock;
  const updateWorkplace = workplaceService.updateWorkplace as jest.Mock;
  const deleteWorkplace = workplaceService.deleteWorkplace as jest.Mock;
  const getPublishedBookStats = workplaceService.getPublishedBookStats as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (preferences.device as { activeWorkplaceId?: string }).activeWorkplaceId = undefined;
  });

  it('rejects restore finish when the published Workplace is missing', async () => {
    getWorkplace.mockResolvedValue(undefined);
    await expect(finishSetup(restoreDraft())).rejects.toThrow('Restore publication is incomplete');
    expect(preferences.device.setActiveWorkplaceId).not.toHaveBeenCalled();
  });

  it('keeps default workplace names distinct', async () => {
    const createWorkplace = workplaceService.createWorkplace as jest.Mock;
    (workplaceService.getAllWorkplaces as jest.Mock).mockResolvedValue([
      { name: 'Personal workplace' },
      { name: 'Personal workplace 2' },
    ]);
    createWorkplace.mockResolvedValue({ id: operationId });

    await finishWorkplaceSetup(operationId, {
      ...workplace,
      name: { value: 'Personal workplace', source: 'defaulted' },
    });

    const createdName = createWorkplace.mock.calls[0][0] as string;
    expect(createdName).not.toBe('Personal workplace');
    expect(createdName).not.toBe('Personal workplace 2');
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

  it('turns a rejected Workplace read into a retryable summary failure', async () => {
    getWorkplace.mockRejectedValue(new Error('db'));
    await expect(loadRestoreSummary(restoreDraft())).rejects.toThrow(
      'Could not verify the published restore workplace',
    );
    getWorkplace.mockResolvedValue({
      id: operationId,
      name: 'Books',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    });
    getPublishedBookStats.mockResolvedValue({ accounts: 4, categories: 6, journals: 2 });
    await expect(loadRestoreSummary(restoreDraft())).resolves.toMatchObject({
      name: 'Books',
      currency: 'USD',
      accounts: 4,
      categories: 6,
      journals: 2,
    });
  });

  it('loads every published workplace in a bulk restore summary', async () => {
    const secondOperationId = asWorkplaceId('operation-2');
    const draft = {
      ...restoreDraft(),
      restore: {
        ...restoreDraft().restore,
        sources: [
          restoreDraft().restore.sources![0],
          {
            source: {
              uri: 'file:///backup.json',
              name: 'backup.json',
              fingerprint: 'abc',
              workplaceIndex: 1,
            },
            operationId: secondOperationId,
            facts: { workplace: { name: 'Books 2' } },
          },
        ],
      },
    };
    getWorkplace.mockImplementation(async (id: string) => ({
      id,
      name: id === operationId ? 'Books' : 'Books 2',
      icon: 'briefcase',
      defaultCurrencyCode: id === operationId ? 'USD' : 'EUR',
    }));
    getPublishedBookStats.mockResolvedValue({ accounts: 4, categories: 6, journals: 2 });

    await expect(loadRestoreSummary(draft)).resolves.toMatchObject({ name: 'Books' });
    await expect(loadRestoreSummaries(draft)).resolves.toMatchObject([
      { name: 'Books', currency: 'USD' },
      { name: 'Books 2', currency: 'EUR' },
    ]);
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

  it('deletes every restore-created workplace, including a partial batch', async () => {
    const secondOperationId = asWorkplaceId('operation-2');
    getWorkplace.mockImplementation(async (id: string) => ({
      id,
      name: 'Books',
      icon: 'briefcase',
      defaultCurrencyCode: 'USD',
    }));
    const draft = {
      ...restoreDraft(),
      restore: {
        ...restoreDraft().restore,
        handoffs: undefined,
        sources: [
          restoreDraft().restore.sources![0],
          {
            source: {
              uri: 'file:///backup.json',
              name: 'backup.json',
              fingerprint: 'abc',
              workplaceIndex: 1,
            },
            operationId: secondOperationId,
            facts: { workplace: { name: 'Books 2' } },
          },
        ],
      },
    };

    await discardRestorePublication(draft);

    expect(deleteWorkplace).toHaveBeenCalledWith(operationId);
    expect(deleteWorkplace).toHaveBeenCalledWith(secondOperationId);
  });

  it('fails closed when discard cannot verify the Workplace', async () => {
    getWorkplace.mockRejectedValue(new Error('db'));

    await expect(discardPublishedRestore(restoreDraft())).rejects.toThrow(
      'Could not verify the published restore workplace',
    );
    expect(deleteWorkplace).not.toHaveBeenCalled();
  });
});
