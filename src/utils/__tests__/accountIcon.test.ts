import { Icon } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';

import { getAccountFallbackIcon, getAccountIcon } from '../accountIcon';

describe('getAccountFallbackIcon', () => {
  it('returns tag for EXPENSE accounts', () => {
    expect(getAccountFallbackIcon(AccountType.EXPENSE)).toBe(Icon.Tag);
    expect(getAccountFallbackIcon('expense')).toBe(Icon.Tag);
    expect(getAccountFallbackIcon('EXPENSE')).toBe(Icon.Tag);
  });

  it('returns trendingUp for INCOME accounts', () => {
    expect(getAccountFallbackIcon(AccountType.INCOME)).toBe(Icon.TrendingUp);
    expect(getAccountFallbackIcon('income')).toBe(Icon.TrendingUp);
    expect(getAccountFallbackIcon('INCOME')).toBe(Icon.TrendingUp);
  });

  it('returns wallet for ASSET, LIABILITY, EQUITY and unknown types', () => {
    expect(getAccountFallbackIcon(AccountType.ASSET)).toBe(Icon.Wallet);
    expect(getAccountFallbackIcon(AccountType.LIABILITY)).toBe(Icon.Wallet);
    expect(getAccountFallbackIcon(AccountType.EQUITY)).toBe(Icon.Wallet);
    expect(getAccountFallbackIcon(null)).toBe(Icon.Wallet);
    expect(getAccountFallbackIcon(undefined)).toBe(Icon.Wallet);
    expect(getAccountFallbackIcon('unknown')).toBe(Icon.Wallet);
  });
});

describe('getAccountIcon', () => {
  it('returns icon when icon is set in database', () => {
    expect(
      getAccountIcon({
        icon: Icon.ShoppingBag,
        name: 'Groceries',
        accountType: AccountType.EXPENSE,
      }),
    ).toBe(Icon.ShoppingBag);
  });

  it('falls back to category fallback when icon is missing', () => {
    expect(
      getAccountIcon({
        name: 'Groceries',
        accountType: AccountType.EXPENSE,
      }),
    ).toBe(Icon.Tag);

    expect(
      getAccountIcon({
        name: 'Salary',
        accountType: AccountType.INCOME,
      }),
    ).toBe(Icon.TrendingUp);

    expect(
      getAccountIcon({
        name: 'Cash',
        accountType: AccountType.ASSET,
      }),
    ).toBe(Icon.Wallet);
  });

  it('falls back when stored icon is unknown', () => {
    expect(
      getAccountIcon({
        icon: 'not-an-icon',
        name: 'Groceries',
        accountType: AccountType.EXPENSE,
      }),
    ).toBe(Icon.Tag);
  });

  it('handles system accounts (OBE and Balance Corrections)', () => {
    expect(
      getAccountIcon({
        name: 'Opening Balances (USD)',
        accountType: AccountType.EQUITY,
      }),
    ).toBe(Icon.Scale);

    expect(
      getAccountIcon({
        name: 'Balance Corrections (EUR)',
        accountType: AccountType.EQUITY,
      }),
    ).toBe(Icon.Wrench);
  });
});
