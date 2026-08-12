import { AccountType, AccountId } from '@/src/types/domain';

import {
  accountFormDraftReducer,
  createAccountFormDraft,
  mapAccountToCoreDraft,
  shouldSeedAccountBalanceDraft,
  shouldSeedAccountCoreDraft,
  shouldSeedAccountMetadataDraft,
} from '../accountFormDraft';

const defaults = {
  accountName: '',
  accountType: AccountType.ASSET,
  accountSubtype: 'CASH' as any,
  selectedCurrency: 'USD',
  selectedIcon: 'wallet' as const,
  selectedColor: '',
  parentAccountId: '' as AccountId,
};

describe('accountFormDraft', () => {
  describe('shouldSeedAccountCoreDraft', () => {
    const account = { id: 'a1' as AccountId } as any;

    it('seeds when first non-null record arrives for an id', () => {
      expect(
        shouldSeedAccountCoreDraft({
          accountId: 'a1' as AccountId,
          seededAccountId: null,
          existingAccount: account,
        }),
      ).toBe(true);
    });

    it('does not re-seed the same id on later observe ticks', () => {
      expect(
        shouldSeedAccountCoreDraft({
          accountId: 'a1' as AccountId,
          seededAccountId: 'a1' as AccountId,
          existingAccount: account,
        }),
      ).toBe(false);
    });

    it('re-seeds when accountId changes', () => {
      expect(
        shouldSeedAccountCoreDraft({
          accountId: 'a2' as AccountId,
          seededAccountId: 'a1' as AccountId,
          existingAccount: { id: 'a2' as AccountId } as any,
        }),
      ).toBe(true);
    });

    it('ignores stale observe emission for a different id', () => {
      expect(
        shouldSeedAccountCoreDraft({
          accountId: 'a2' as AccountId,
          seededAccountId: null,
          existingAccount: account,
        }),
      ).toBe(false);
    });
  });

  describe('shouldSeedAccountBalanceDraft', () => {
    it('seeds once per accountId when balance arrives', () => {
      expect(
        shouldSeedAccountBalanceDraft({
          accountId: 'a1' as AccountId,
          seededBalanceAccountId: null,
          balanceData: { balance: 10 },
        }),
      ).toBe(true);
      expect(
        shouldSeedAccountBalanceDraft({
          accountId: 'a1' as AccountId,
          seededBalanceAccountId: 'a1' as AccountId,
          balanceData: { balance: 99 },
        }),
      ).toBe(false);
    });
  });

  describe('shouldSeedAccountMetadataDraft', () => {
    it('seeds once per accountId when metadata arrives', () => {
      expect(
        shouldSeedAccountMetadataDraft({
          accountId: 'a1' as AccountId,
          seededMetadataAccountId: null,
          existingMetadata: { notes: 'x' } as any,
        }),
      ).toBe(true);
      expect(
        shouldSeedAccountMetadataDraft({
          accountId: 'a1' as AccountId,
          seededMetadataAccountId: 'a1' as AccountId,
          existingMetadata: { notes: 'y' } as any,
        }),
      ).toBe(false);
    });
  });

  describe('accountFormDraftReducer', () => {
    it('SEED_EDIT_CORE ignores later ticks for the same id (charting lock)', () => {
      const initial = createAccountFormDraft(defaults);
      const seeded = accountFormDraftReducer(initial, {
        type: 'SEED_EDIT_CORE',
        accountId: 'a1' as AccountId,
        core: { ...coreFrom(initial), accountName: 'Checking' },
      });
      expect(seeded.core.accountName).toBe('Checking');

      const dirty = accountFormDraftReducer(seeded, {
        type: 'PATCH_CORE',
        patch: { accountName: 'Dirty' },
      });
      const locked = accountFormDraftReducer(dirty, {
        type: 'SEED_EDIT_CORE',
        accountId: 'a1' as AccountId,
        core: { ...coreFrom(initial), accountName: 'FromObserve' },
      });
      expect(locked.core.accountName).toBe('Dirty');
    });

    it('SEED_BALANCE does not overwrite after first inject', () => {
      let state = createAccountFormDraft(defaults);
      state = accountFormDraftReducer(state, {
        type: 'SEED_EDIT_CORE',
        accountId: 'a1' as AccountId,
        core: coreFrom(state),
      });
      state = accountFormDraftReducer(state, {
        type: 'SEED_BALANCE',
        accountId: 'a1' as AccountId,
        initialBalance: '100',
      });
      state = accountFormDraftReducer(state, {
        type: 'PATCH_CORE',
        patch: { initialBalance: '250' },
      });
      state = accountFormDraftReducer(state, {
        type: 'SEED_BALANCE',
        accountId: 'a1' as AccountId,
        initialBalance: '100',
      });
      expect(state.core.initialBalance).toBe('250');
    });

    it('SET_ACCOUNT_TYPE resets subtype to the type default', () => {
      const state = accountFormDraftReducer(createAccountFormDraft(defaults), {
        type: 'SET_ACCOUNT_TYPE',
        accountType: AccountType.EXPENSE,
      });
      expect(state.core.accountType).toBe(AccountType.EXPENSE);
      expect(state.core.accountSubtype).toBeTruthy();
    });
  });

  describe('mapAccountToCoreDraft', () => {
    it('maps observed account into core draft fields', () => {
      const account = {
        id: 'a1',
        name: 'Cash',
        accountType: AccountType.ASSET,
        accountSubtype: 'CASH',
        currencyCode: 'EUR',
        icon: 'wallet',
        color: '#F87171',
        parentAccountId: '',
      } as any;
      const core = mapAccountToCoreDraft(account, { pathname: '/account-creation' }, 'USD');
      expect(core.accountName).toBe('Cash');
      expect(core.selectedCurrency).toBe('EUR');
      expect(core.selectedColor).toBe('#F87171');
    });

    it('maps missing color to auto (empty string)', () => {
      const account = {
        id: 'a2',
        name: 'Wallet',
        accountType: AccountType.ASSET,
        accountSubtype: 'CASH',
        currencyCode: 'USD',
        icon: 'wallet',
        parentAccountId: '',
      } as any;
      const core = mapAccountToCoreDraft(account, { pathname: '/account-creation' }, 'USD');
      expect(core.selectedColor).toBe('');
    });
  });
});

function coreFrom(state: ReturnType<typeof createAccountFormDraft>) {
  return { ...state.core };
}
