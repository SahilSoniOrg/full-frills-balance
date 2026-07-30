import { AccountType } from '@/src/data/models/Account';
import {
  filterEligibleCounterparties,
  filterSuggestedCounterparties,
  getSuggestedCounterpartyTypes,
  isBalanceChangedBeyondEpsilon,
  needsBalanceChangeClassification,
  resolveBalanceChangeRequirement,
} from '../balanceChangeClassification';

describe('balanceChangeClassification', () => {
  describe('needsBalanceChangeClassification', () => {
    it('is true for balance-sheet types only', () => {
      expect(needsBalanceChangeClassification(AccountType.ASSET)).toBe(true);
      expect(needsBalanceChangeClassification(AccountType.LIABILITY)).toBe(true);
      expect(needsBalanceChangeClassification(AccountType.EQUITY)).toBe(true);
      expect(needsBalanceChangeClassification(AccountType.INCOME)).toBe(false);
      expect(needsBalanceChangeClassification(AccountType.EXPENSE)).toBe(false);
    });
  });

  describe('getSuggestedCounterpartyTypes', () => {
    it('maps asset delta to income or expense', () => {
      expect(getSuggestedCounterpartyTypes(AccountType.ASSET, 50)).toEqual([AccountType.INCOME]);
      expect(getSuggestedCounterpartyTypes(AccountType.ASSET, -50)).toEqual([AccountType.EXPENSE]);
    });

    it('maps liability delta to expense or asset', () => {
      expect(getSuggestedCounterpartyTypes(AccountType.LIABILITY, 50)).toEqual([
        AccountType.EXPENSE,
      ]);
      expect(getSuggestedCounterpartyTypes(AccountType.LIABILITY, -50)).toEqual([
        AccountType.ASSET,
      ]);
    });

    it('maps equity to asset and liability regardless of direction', () => {
      expect(getSuggestedCounterpartyTypes(AccountType.EQUITY, 10)).toEqual([
        AccountType.ASSET,
        AccountType.LIABILITY,
      ]);
      expect(getSuggestedCounterpartyTypes(AccountType.EQUITY, -10)).toEqual([
        AccountType.ASSET,
        AccountType.LIABILITY,
      ]);
    });

    it('returns empty for zero delta or category types', () => {
      expect(getSuggestedCounterpartyTypes(AccountType.ASSET, 0)).toEqual([]);
      expect(getSuggestedCounterpartyTypes(AccountType.INCOME, 10)).toEqual([]);
    });
  });

  describe('counterparties filters', () => {
    const accounts = [
      { id: 'cash', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: null },
      { id: 'bank', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: null },
      {
        id: 'salary',
        accountType: AccountType.INCOME,
        currencyCode: 'USD',
        parentAccountId: null,
      },
      {
        id: 'food',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
        parentAccountId: null,
      },
      {
        id: 'card',
        accountType: AccountType.LIABILITY,
        currencyCode: 'USD',
        parentAccountId: null,
      },
      {
        id: 'eur-cash',
        accountType: AccountType.ASSET,
        currencyCode: 'EUR',
        parentAccountId: null,
      },
      {
        id: 'group',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: null,
      },
      {
        id: 'child',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: 'group',
      },
    ];

    it('excludes edited account, parents, and other currencies', () => {
      const eligible = filterEligibleCounterparties(accounts, {
        excludeAccountId: 'cash',
        currencyCode: 'USD',
      });
      const ids = eligible.map(a => a.id);
      expect(ids).not.toContain('cash');
      expect(ids).not.toContain('group');
      expect(ids).not.toContain('eur-cash');
      expect(ids).toContain('bank');
      expect(ids).toContain('child');
      expect(ids).toContain('salary');
    });

    it('filters suggested counterparties by asset-up matrix', () => {
      const suggested = filterSuggestedCounterparties(accounts, {
        accountType: AccountType.ASSET,
        discrepancy: 100,
        excludeAccountId: 'cash',
        currencyCode: 'USD',
      });
      expect(suggested.map(a => a.id)).toEqual(['salary']);
    });

    it('filters suggested counterparties by liability-down matrix', () => {
      const suggested = filterSuggestedCounterparties(accounts, {
        accountType: AccountType.LIABILITY,
        discrepancy: -40,
        excludeAccountId: 'card',
        currencyCode: 'USD',
      });
      expect(suggested.map(a => a.id).sort()).toEqual(['bank', 'cash', 'child']);
    });
  });

  describe('isBalanceChangedBeyondEpsilon', () => {
    it('detects meaningful balance changes', () => {
      expect(isBalanceChangedBeyondEpsilon(100, 100)).toBe(false);
      expect(isBalanceChangedBeyondEpsilon(100.0005, 100)).toBe(false);
      expect(isBalanceChangedBeyondEpsilon(105, 100)).toBe(true);
      expect(isBalanceChangedBeyondEpsilon(NaN, 100)).toBe(false);
    });
  });

  describe('resolveBalanceChangeRequirement', () => {
    it('skips when balance did not change', () => {
      expect(
        resolveBalanceChangeRequirement({
          canAdjustBalance: true,
          targetBalance: 100,
          currentBalance: 100,
        }),
      ).toEqual({ shouldAdjust: false });
    });

    it('skips for category accounts', () => {
      expect(
        resolveBalanceChangeRequirement({
          canAdjustBalance: false,
          targetBalance: 150,
          currentBalance: 100,
        }),
      ).toEqual({ shouldAdjust: false });
    });

    it('throws when delta exists without counterparty', () => {
      expect(() =>
        resolveBalanceChangeRequirement({
          canAdjustBalance: true,
          targetBalance: 150,
          currentBalance: 100,
        }),
      ).toThrow(/classifying/);
    });

    it('returns the counterparty when delta requires a journal', () => {
      const balanceChange = { kind: 'adjustment' as const };
      expect(
        resolveBalanceChangeRequirement({
          canAdjustBalance: true,
          targetBalance: 150,
          currentBalance: 100,
          balanceChange,
        }),
      ).toEqual({ shouldAdjust: true, balanceChange });
    });
  });
});
