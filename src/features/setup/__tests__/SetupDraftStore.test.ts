import { asWorkplaceId } from '@/src/types/ids';
import { parseSetupDraft, SETUP_DRAFT_KEY, SetupDraftStore } from '../SetupDraftStore';
import { storage } from '@/src/utils/storage';
import type { FirstRunSetupDraft, RestoreSetupDraft } from '../setupTypes';
import { AccountType } from '@/src/types/enums';

jest.mock('@/src/utils/storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), remove: jest.fn() },
}));

const mockGetString = storage.getString as jest.Mock;
const mockSet = storage.set as jest.Mock;
const mockRemove = storage.remove as jest.Mock;

const operationId = asWorkplaceId('operation');

const draft: FirstRunSetupDraft = {
  schemaVersion: 1,
  kind: 'first_run',
  journeyId: 'first_run',
  entryPolicy: 'blocking',
  operationId,
  presentedHistory: ['device'],
  acceptedSlices: ['device'],
  device: { displayName: { value: 'Sahil', source: 'user_entered' } },
};

const restoreDraft: RestoreSetupDraft = {
  schemaVersion: 1,
  kind: 'restore',
  journeyId: 'settings_restore',
  entryPolicy: 'optional',
  operationId,
  presentedHistory: ['restore_source'],
  acceptedSlices: ['restore_source'],
  restore: {
    source: {
      source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
      facts: { workplace: { name: 'Imported', defaultCurrencyCode: 'USD' } },
    },
  },
};

describe('SetupDraftStore', () => {
  beforeEach(() => {
    mockGetString.mockReset();
    mockSet.mockReset();
    mockRemove.mockReset();
  });

  it('round-trips a typed first-run draft', () => {
    const store = new SetupDraftStore();
    store.save(draft);
    expect(mockSet).toHaveBeenCalledWith(SETUP_DRAFT_KEY, JSON.stringify(draft));
    mockGetString.mockReturnValue(JSON.stringify(draft));
    expect(store.load()).toEqual(draft);
  });

  it('round-trips restore source facts without raw books', () => {
    const store = new SetupDraftStore();
    store.save(restoreDraft);
    mockGetString.mockReturnValue(JSON.stringify(restoreDraft));
    expect(store.load()).toEqual(restoreDraft);
    expect(JSON.stringify(restoreDraft)).not.toContain('canonicalData');
  });

  it('accepts starter selections in the persisted schema shape', () => {
    const withWorkplace: FirstRunSetupDraft = {
      ...draft,
      presentedHistory: ['device', 'workplace'],
      acceptedSlices: ['device', 'workplace'],
      workplace: {
        name: { value: "Sahil's Personal workplace", source: 'defaulted' },
        icon: { value: 'briefcase', source: 'defaulted' },
        baseCurrency: { value: 'USD', source: 'defaulted' },
        selectedAccounts: [{ name: 'Cash', type: AccountType.ASSET, icon: 'wallet' }],
        selectedCategories: [{ name: 'Salary', type: AccountType.INCOME, icon: 'trendingUp' }],
        acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
      },
    };

    expect(parseSetupDraft(withWorkplace)).toEqual(withWorkplace);
  });

  it.each([
    { schemaVersion: 2 },
    { schemaVersion: 1, kind: 'first_run', journeyId: 'unknown' },
    {
      schemaVersion: 1,
      kind: 'first_run',
      journeyId: 'first_run',
      entryPolicy: 'blocking',
      operationId: 'x',
      presentedHistory: ['bogus'],
      acceptedSlices: [],
    },
  ])('rejects malformed drafts %#', partial => {
    expect(parseSetupDraft({ ...partial })).toBeUndefined();
  });

  it('rejects an impossible accepted output and operation-mismatched handoff', () => {
    expect(
      parseSetupDraft({ ...draft, acceptedSlices: ['device'], device: undefined }),
    ).toBeUndefined();
    expect(
      parseSetupDraft({
        ...restoreDraft,
        journeyId: 'first_run_restore',
        entryPolicy: 'blocking',
        restore: {
          ...restoreDraft.restore,
          handoff: {
            operationId: asWorkplaceId('other-operation'),
            workplaceId: asWorkplaceId('published'),
            fingerprint: 'abc',
            facts: { workplace: {} },
            stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
            warnings: [],
          },
        },
      }),
    ).toBeUndefined();
  });

  it('rejects a restore handoff that is not one ownership tuple', () => {
    const withHandoff = {
      ...restoreDraft,
      restore: {
        ...restoreDraft.restore,
        handoff: {
          operationId,
          workplaceId: asWorkplaceId('other-workplace'),
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
          warnings: [],
        },
      },
    };
    mockGetString.mockReturnValue(JSON.stringify({ [operationId]: 'abc' }));
    expect(parseSetupDraft(withHandoff)).toBeUndefined();

    const matching = {
      ...restoreDraft,
      restore: {
        ...restoreDraft.restore,
        handoff: {
          operationId,
          workplaceId: operationId,
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
          warnings: [],
        },
      },
    };
    mockGetString.mockReturnValue(undefined);
    expect(parseSetupDraft(matching)).toBeUndefined();
    mockGetString.mockReturnValue(JSON.stringify({ [operationId]: 'abc' }));
    const parsed = parseSetupDraft(matching);
    expect(parsed?.kind === 'restore' && parsed.restore.handoff?.workplaceId).toBe(operationId);
  });

  it('clears only the setup draft key', () => {
    new SetupDraftStore().clear();
    expect(mockRemove).toHaveBeenCalledWith(SETUP_DRAFT_KEY);
  });
});
