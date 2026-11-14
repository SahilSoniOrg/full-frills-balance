import { Icon } from '@/src/types/domainIcons';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { discardUnreadableSetupDraft, parseSetupDraft, SETUP_DRAFT_KEY, SetupDraftStore } from '../SetupDraftStore';
import { storage } from '@/src/utils/storage';
import type { RestoreSetupDraft } from '../setupTypes';
import { AccountType } from '@/src/types/enums';

jest.mock('@/src/utils/storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), remove: jest.fn() },
}));

const mockGetString = storage.getString as jest.Mock;
const mockSet = storage.set as jest.Mock;
const mockRemove = storage.remove as jest.Mock;

const operationId = asWorkplaceId('operation');

const draft: RestoreSetupDraft = {
  schemaVersion: 1,
  kind: 'restore',
  journeyId: 'first_run_restore',
  entryPolicy: 'blocking',
  operationId,
  presentedHistory: ['device'],
  acceptedSlices: ['device'],
  restore: {},
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
    sources: [
      {
        source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
        facts: { workplace: { name: 'Imported', defaultCurrencyCode: 'USD' } },
      },
    ],
  },
};

describe('SetupDraftStore', () => {
  beforeEach(() => {
    mockGetString.mockReset();
    mockSet.mockReset();
    mockRemove.mockReset();
  });

  it('round-trips a typed draft', () => {
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
    const withWorkplace: RestoreSetupDraft = {
      ...draft,
      presentedHistory: ['device', 'workplace'],
      acceptedSlices: ['device', 'workplace'],
      workplace: {
        name: { value: "Sahil's Personal workplace", source: 'defaulted' },
        icon: { value: Icon.Briefcase, source: 'defaulted' },
        baseCurrency: { value: 'USD', source: 'defaulted' },
        selectedAccounts: [{ name: 'Cash', type: AccountType.ASSET, icon: Icon.Wallet }],
        selectedCategories: [{ name: 'Salary', type: AccountType.INCOME, icon: Icon.TrendingUp }],
        acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
      },
    };

    expect(parseSetupDraft(withWorkplace)).toEqual(withWorkplace);
  });

  it('migrates accepted legacy creation output without publishing or dropping custom definitions', () => {
    const legacy = {
      schemaVersion: 1,
      kind: 'workplace_creation',
      journeyId: 'create_workplace',
      entryPolicy: 'optional',
      operationId,
      presentedHistory: ['workplace', 'summary'],
      acceptedSlices: ['workplace', 'summary'],
      workplace: {
        name: { value: 'Family Books', source: 'imported' },
        icon: { value: Icon.Briefcase, source: 'imported' },
        baseCurrency: { value: 'CAD', source: 'existing' },
        selectedAccounts: [{ id: asAccountId('legacy-brokerage'), name: 'Brokerage', type: AccountType.ASSET, icon: Icon.Briefcase }],
        selectedCategories: [{ id: asAccountId('legacy-custom'), name: 'Custom income', type: AccountType.INCOME, icon: Icon.TrendingUp }],
        acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
      },
      summary: { confirmed: true },
    };

    const migrated = parseSetupDraft(legacy);
    expect(migrated).toMatchObject({
      kind: 'cash_clarity',
      journeyId: 'add_workplace',
      intent: 'add_workplace',
      context: 'workplace_picker',
      entryPolicy: 'optional',
      operationId,
      step: 'clarity',
      legacyProvenance: { name: 'imported', icon: 'imported', currency: 'existing' },
      draft: {
        workplaceName: 'Family Books',
        workplaceIcon: Icon.Briefcase,
        currency: 'CAD',
        preservedStarterAccounts: [{ id: 'legacy-brokerage', name: 'Brokerage' }],
        preservedStarterCategories: [{ id: 'legacy-custom', name: 'Custom income' }],
      },
    });
    expect(migrated?.kind === 'cash_clarity' && migrated.publication).toBeUndefined();
  });

  it('maps an empty registered-device creation draft to the blocking conversational entry', () => {
    const migrated = parseSetupDraft({
      schemaVersion: 1,
      kind: 'workplace_creation',
      journeyId: 'empty_device_workplace',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: [],
      acceptedSlices: [],
    });
    expect(migrated).toMatchObject({
      kind: 'cash_clarity',
      journeyId: 'add_workplace',
      intent: 'add_workplace',
      context: 'registered_empty_device',
      entryPolicy: 'blocking',
      operationId,
      step: 'currency',
    });
  });

  it('replaces valid legacy bytes only after the session migration succeeds', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      kind: 'workplace_creation',
      journeyId: 'empty_device_workplace',
      entryPolicy: 'blocking',
      operationId,
      presentedHistory: [],
      acceptedSlices: [],
    });
    mockGetString.mockReturnValue(raw);
    const migrated = new SetupDraftStore().load();
    expect(migrated?.kind).toBe('cash_clarity');
    expect(mockSet).toHaveBeenCalledWith(
      SETUP_DRAFT_KEY,
      expect.stringContaining('"schemaVersion":2'),
    );
  });

  it('leaves unsupported payloads untouched for explicit recovery', () => {
    const raw = JSON.stringify({ schemaVersion: 99, kind: 'unknown' });
    mockGetString.mockReturnValue(raw);
    expect(new SetupDraftStore().load()).toBeUndefined();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('copies unreadable bytes to recovery before clearing the active store', () => {
    const raw = '{"schemaVersion":99,"kind":"future"';
    mockGetString.mockReturnValue(raw);
    discardUnreadableSetupDraft();
    expect(mockSet).toHaveBeenCalledWith(`${SETUP_DRAFT_KEY}_recovery`, raw);
    expect(mockRemove).toHaveBeenCalledWith(SETUP_DRAFT_KEY);
  });

  it.each([
    { schemaVersion: 2 },
    { schemaVersion: 1, kind: 'first_run', journeyId: 'unknown' },
    {
      schemaVersion: 1,
      kind: 'workplace_creation',
      journeyId: 'empty_device_workplace',
      entryPolicy: 'blocking',
      operationId: 'x',
      presentedHistory: ['bogus'],
      acceptedSlices: [],
    },
    {
      schemaVersion: 1,
      kind: 'first_run',
      journeyId: 'first_run',
      entryPolicy: 'blocking',
      operationId: 'x',
      presentedHistory: [],
      acceptedSlices: [],
    },
  ])('rejects malformed and retired drafts %#', partial => {
    expect(parseSetupDraft({ ...partial })).toBeUndefined();
  });

  it('drops the retired appearance step from saved drafts', () => {
    expect(
      parseSetupDraft({
        ...draft,
        presentedHistory: ['device', 'appearance'],
        acceptedSlices: ['device', 'appearance'],
        activeSlice: 'appearance',
        appearance: {
          themeId: { value: 'ivy', source: 'user_entered' },
          fontId: { value: 'ivy', source: 'user_entered' },
        },
      }),
    ).toEqual(draft);
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
          handoffs: [
            {
              operationId: asWorkplaceId('other-operation'),
              workplaceId: asWorkplaceId('published'),
              fingerprint: 'abc',
              facts: { workplace: {} },
              stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
              warnings: [],
            },
          ],
        },
      }),
    ).toBeUndefined();
  });

  it('rejects a restore handoff that is not one ownership tuple', () => {
    const withHandoff = {
      ...restoreDraft,
      restore: {
        ...restoreDraft.restore,
        handoffs: [
          {
            operationId,
            workplaceId: asWorkplaceId('other-workplace'),
            fingerprint: 'abc',
            facts: { workplace: {} },
            stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
    };
    mockGetString.mockReturnValue(JSON.stringify({ [operationId]: 'abc' }));
    expect(parseSetupDraft(withHandoff)).toBeUndefined();

    const matching = {
      ...restoreDraft,
      restore: {
        ...restoreDraft.restore,
        handoffs: [
          {
            operationId,
            workplaceId: operationId,
            fingerprint: 'abc',
            facts: { workplace: {} },
            stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
            warnings: [],
          },
        ],
      },
    };
    mockGetString.mockReturnValue(undefined);
    expect(parseSetupDraft(matching)).toBeUndefined();
    mockGetString.mockReturnValue(JSON.stringify({ [operationId]: 'abc' }));
    const parsed = parseSetupDraft(matching);
    expect(parsed?.kind === 'restore' && parsed.restore.handoffs?.[0]?.workplaceId).toBe(
      operationId,
    );
  });

  it('flattens a legacy nested source and handoff into sources and handoffs', () => {
    mockGetString.mockReturnValue(JSON.stringify({ [operationId]: 'abc' }));
    const parsed = parseSetupDraft({
      ...restoreDraft,
      restore: {
        source: {
          source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
          facts: { workplace: { name: 'Imported', defaultCurrencyCode: 'USD' } },
          batch: [
            {
              source: {
                uri: 'file:///backup.json',
                name: 'backup.json',
                fingerprint: 'abc',
                workplaceIndex: 1,
              },
              operationId: asWorkplaceId('operation-2'),
              facts: { workplace: { name: 'Books 2' } },
            },
          ],
        },
        handoff: {
          operationId,
          workplaceId: operationId,
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
          warnings: [],
        },
      },
    });
    expect(
      parsed?.kind === 'restore' && parsed.restore.sources?.map(item => item.facts.workplace.name),
    ).toEqual(['Imported', 'Books 2']);
    expect(parsed?.kind === 'restore' && parsed.restore.handoffs?.[0]?.workplaceId).toBe(
      operationId,
    );
    expect(parsed?.kind === 'restore' && 'source' in parsed.restore).toBe(false);
    expect(parsed?.kind === 'restore' && 'handoff' in parsed.restore).toBe(false);
  });

  it('clears only the setup draft key', () => {
    new SetupDraftStore().clear();
    expect(mockRemove).toHaveBeenCalledWith(SETUP_DRAFT_KEY);
  });
});
