import {
  computeSimpleConvertedAmount,
  deriveCrossCurrencyDisplayRate,
  ensureSelectedAccountVisible,
  isSimpleTargetAccountUnset,
  resolveSimpleCrossCurrencyRates,
  resolveTargetAccountIdForSimpleTab,
} from '@/src/services/journal/simpleJournalHelpers';
import { AccountType, EMPTY_ACCOUNT_ID } from '@/src/types/domain';

describe('simpleJournalHelpers cross-currency', () => {
  describe('deriveCrossCurrencyDisplayRate', () => {
    it('computes source per dest from base-relative rates', () => {
      expect(deriveCrossCurrencyDisplayRate(83, 1)).toBe(83);
      expect(deriveCrossCurrencyDisplayRate(1, 83)).toBeCloseTo(1 / 83);
    });
  });

  describe('resolveSimpleCrossCurrencyRates', () => {
    it('uses 1.0 for legs already in workplace currency', () => {
      const resolved = resolveSimpleCrossCurrencyRates({
        sourceCurrency: 'USD',
        destCurrency: 'INR',
        workplaceCurrency: 'USD',
        fetchedSourceToWorkplace: 99,
        fetchedDestToWorkplace: 83,
      });
      expect(resolved.sourceBaseRate).toBe(1);
      expect(resolved.destBaseRate).toBe(83);
      expect(resolved.exchangeRate).toBeCloseTo(1 / 83);
    });

    it('uses fetched rates for both legs when neither is workplace currency', () => {
      const resolved = resolveSimpleCrossCurrencyRates({
        sourceCurrency: 'EUR',
        destCurrency: 'INR',
        workplaceCurrency: 'USD',
        fetchedSourceToWorkplace: 1.1,
        fetchedDestToWorkplace: 83,
      });
      expect(resolved.sourceBaseRate).toBe(1.1);
      expect(resolved.destBaseRate).toBe(83);
      expect(resolved.exchangeRate).toBeCloseTo(1.1 / 83);
    });
  });

  describe('computeSimpleConvertedAmount', () => {
    it('returns amount unchanged when not cross-currency', () => {
      expect(computeSimpleConvertedAmount(50, false, 2)).toBe(50);
    });

    it('multiplies by exchange rate when cross-currency', () => {
      expect(computeSimpleConvertedAmount(100, true, 0.5)).toBe(50);
      expect(computeSimpleConvertedAmount(100, true, null)).toBe(100);
    });
  });
});

describe('ensureSelectedAccountVisible', () => {
  const pool = [
    { id: 'cash', name: 'Cash', accountType: AccountType.ASSET },
    { id: 'bank', name: 'Bank', accountType: AccountType.ASSET },
    { id: 'equity', name: 'Equity', accountType: AccountType.EQUITY },
  ] as any[];

  it('prepends the selected account when it is missing from the section list', () => {
    expect(
      ensureSelectedAccountVisible(
        [{ id: 'bank', name: 'Bank', accountType: AccountType.ASSET } as any],
        'equity' as any,
        pool,
      ).map(account => account.id),
    ).toEqual(['equity', 'bank']);
  });

  it('returns the section unchanged when nothing is selected', () => {
    const section = [{ id: 'bank', name: 'Bank', accountType: AccountType.ASSET } as any];
    expect(ensureSelectedAccountVisible(section, EMPTY_ACCOUNT_ID, pool)).toBe(section);
  });
});

describe('resolveTargetAccountIdForSimpleTab', () => {
  it('resolves expense target account when account type is EXPENSE', () => {
    const suggestion = {
      description: 'Starbucks',
      count: 5,
      targetAccountId: 'coffee-acc' as any,
      targetAccountName: 'Coffee & Dining',
      targetAccountType: AccountType.EXPENSE,
    };
    expect(resolveTargetAccountIdForSimpleTab(suggestion, 'expense')).toBe('coffee-acc');
    // Does not match income tab
    expect(resolveTargetAccountIdForSimpleTab(suggestion, 'income')).toBeUndefined();
    // Does not match transfer tab
    expect(resolveTargetAccountIdForSimpleTab(suggestion, 'transfer')).toBeUndefined();
  });

  it('resolves income target account when account type is INCOME', () => {
    const suggestion = {
      description: 'Acme Corp Salary',
      count: 3,
      targetAccountId: 'salary-acc' as any,
      targetAccountName: 'Salary',
      targetAccountType: AccountType.INCOME,
    };
    expect(resolveTargetAccountIdForSimpleTab(suggestion, 'income')).toBe('salary-acc');
    expect(resolveTargetAccountIdForSimpleTab(suggestion, 'expense')).toBeUndefined();
  });

  it('resolves transfer target account when account type is ASSET or LIABILITY', () => {
    const suggestion = {
      description: 'Transfer to Brokerage',
      count: 4,
      targetAccountId: 'brokerage-acc' as any,
      targetAccountName: 'Brokerage',
      targetAccountType: AccountType.ASSET,
    };
    expect(resolveTargetAccountIdForSimpleTab(suggestion, 'transfer')).toBe('brokerage-acc');
    expect(resolveTargetAccountIdForSimpleTab(suggestion, 'expense')).toBeUndefined();
  });

  it('returns undefined when suggestion has no target account', () => {
    const suggestion = {
      description: 'General Store',
      count: 2,
    };
    expect(resolveTargetAccountIdForSimpleTab(suggestion, 'expense')).toBeUndefined();
  });
});

describe('isSimpleTargetAccountUnset', () => {
  it('checks destination for expense tab', () => {
    expect(isSimpleTargetAccountUnset('expense', 'source-acc' as any, EMPTY_ACCOUNT_ID)).toBe(true);
    expect(isSimpleTargetAccountUnset('expense', 'source-acc' as any, '' as any)).toBe(true);
    expect(isSimpleTargetAccountUnset('expense', 'source-acc' as any, 'dest-acc' as any)).toBe(
      false,
    );
  });

  it('checks source for income tab', () => {
    expect(isSimpleTargetAccountUnset('income', EMPTY_ACCOUNT_ID, 'dest-acc' as any)).toBe(true);
    expect(isSimpleTargetAccountUnset('income', 'source-acc' as any, 'dest-acc' as any)).toBe(
      false,
    );
  });

  it('checks destination for transfer tab', () => {
    expect(isSimpleTargetAccountUnset('transfer', 'source-acc' as any, EMPTY_ACCOUNT_ID)).toBe(
      true,
    );
    expect(isSimpleTargetAccountUnset('transfer', 'source-acc' as any, 'dest-acc' as any)).toBe(
      false,
    );
  });
});
