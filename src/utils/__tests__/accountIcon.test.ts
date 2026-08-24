import { AccountType } from '@/src/types/enums';

import { getAccountFallbackIcon, getAccountIcon } from '../accountIcon';

describe('getAccountFallbackIcon', () => {
  it('returns tag for EXPENSE accounts', () => {
    expect(getAccountFallbackIcon(AccountType.EXPENSE)).toBe('tag');
    expect(getAccountFallbackIcon('expense')).toBe('tag');
    expect(getAccountFallbackIcon('EXPENSE')).toBe('tag');
  });

  it('returns trendingUp for INCOME accounts', () => {
    expect(getAccountFallbackIcon(AccountType.INCOME)).toBe('trendingUp');
    expect(getAccountFallbackIcon('income')).toBe('trendingUp');
    expect(getAccountFallbackIcon('INCOME')).toBe('trendingUp');
  });

  it('returns wallet for ASSET, LIABILITY, EQUITY and unknown types', () => {
    expect(getAccountFallbackIcon(AccountType.ASSET)).toBe('wallet');
    expect(getAccountFallbackIcon(AccountType.LIABILITY)).toBe('wallet');
    expect(getAccountFallbackIcon(AccountType.EQUITY)).toBe('wallet');
    expect(getAccountFallbackIcon(null)).toBe('wallet');
    expect(getAccountFallbackIcon(undefined)).toBe('wallet');
    expect(getAccountFallbackIcon('unknown')).toBe('wallet');
  });
});

describe('getAccountIcon', () => {
  it('returns icon when icon is set in database', () => {
    expect(
      getAccountIcon({
        icon: 'shoppingBag',
        name: 'Groceries',
        accountType: AccountType.EXPENSE,
      }),
    ).toBe('shoppingBag');
  });

  it('falls back to category fallback when icon is missing', () => {
    expect(
      getAccountIcon({
        name: 'Groceries',
        accountType: AccountType.EXPENSE,
      }),
    ).toBe('tag');

    expect(
      getAccountIcon({
        name: 'Salary',
        accountType: AccountType.INCOME,
      }),
    ).toBe('trendingUp');

    expect(
      getAccountIcon({
        name: 'Cash',
        accountType: AccountType.ASSET,
      }),
    ).toBe('wallet');
  });

  it('handles system accounts (OBE and Balance Corrections)', () => {
    expect(
      getAccountIcon({
        name: 'Opening Balances (USD)',
        accountType: AccountType.EQUITY,
      }),
    ).toBe('scale');

    expect(
      getAccountIcon({
        name: 'Balance Corrections (EUR)',
        accountType: AccountType.EQUITY,
      }),
    ).toBe('wrench');
  });
});
