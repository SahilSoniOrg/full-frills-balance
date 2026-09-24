import {
  buildSimpleCrossCurrencyLineUpdates,
  ensureSelectedAccountVisible,
  isSimpleTargetAccountUnset,
  resolveSimpleHeroAmount,
  resolveTargetAccountIdForSimpleTab,
} from '@/src/services/journal/simpleJournalHelpers';
import { AccountType } from '@/src/types/enums';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';

describe('simpleJournalHelpers cross-currency', () => {
  describe('resolveSimpleHeroAmount', () => {
    it('keeps an empty source amount instead of filling from the destination', () => {
      expect(resolveSimpleHeroAmount('', '0.00')).toBe('');
      expect(resolveSimpleHeroAmount('50', '4797.73')).toBe('50');
      expect(resolveSimpleHeroAmount(undefined, '50')).toBe('50');
    });
  });

  it('keeps workplace-relative rates for two lines in the same foreign currency', () => {
    const updates = buildSimpleCrossCurrencyLineUpdates({
      isCrossCurrency: false,
      exchangeRate: 1,
      sourceBaseRate: 95.51,
      destBaseRate: 95.51,
      sourceCurrency: 'USD',
      destCurrency: 'USD',
      destPrecision: 2,
      baseCurrency: 'INR',
      amount: '5.99',
      convertedAmount: 5.99,
      sourceLine: { id: 'source' as any, exchangeRate: '', amount: '5.99' },
      destinationLine: { id: 'destination' as any, exchangeRate: '', amount: '5.99' },
    });

    expect(updates).toEqual({
      source: { exchangeRate: '95.510000' },
      destination: { exchangeRate: '95.510000' },
    });
  });

  const crossCurrencyInput = {
    isCrossCurrency: true,
    exchangeRate: 151.237,
    sourceBaseRate: 1,
    destBaseRate: 0.0066,
    sourceCurrency: 'USD',
    baseCurrency: 'USD',
    amount: '10.00',
    convertedAmount: 1512.37,
    sourceLine: { id: 'source' as any, exchangeRate: '', amount: '10.00' },
    destinationLine: { id: 'destination' as any, exchangeRate: '', amount: '' },
  };

  it('formats the converted amount with the supplied destination precision', () => {
    expect(
      buildSimpleCrossCurrencyLineUpdates({
        ...crossCurrencyInput,
        destCurrency: 'JPY',
        destPrecision: 0,
      }).destination?.amount,
    ).toBe('1512');
    expect(
      buildSimpleCrossCurrencyLineUpdates({
        ...crossCurrencyInput,
        destCurrency: 'JPY',
        destPrecision: 3,
      }).destination?.amount,
    ).toBe('1512.370');
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
