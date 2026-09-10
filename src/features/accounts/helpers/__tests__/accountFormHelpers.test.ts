import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';

import {
  filterPayFromAccountOptions,
  filterPotentialParentAccounts,
  isCategoryAccountType,
  resolveAccountFormHeroCopy,
  resolveAllowedAccountTypes,
  resolveInitialAccountType,
} from '../accountFormHelpers';

describe('accountFormHelpers', () => {
  it('resolveInitialAccountType prefers preview type and category route', () => {
    expect(
      resolveInitialAccountType({
        pathname: '/account-creation',
        typeParam: 'asset',
        previewType: 'income',
      }),
    ).toBe(AccountType.INCOME);
    expect(
      resolveInitialAccountType({ pathname: '/category-creation', typeParam: undefined }),
    ).toBe(AccountType.EXPENSE);
  });

  it('resolveAccountFormHeroCopy varies by category and edit mode', () => {
    const categoryNew = resolveAccountFormHeroCopy({
      isEditMode: false,
      accountType: AccountType.EXPENSE,
      hasExistingAccounts: true,
    });
    expect(categoryNew.heroSubtitle).toBe('');
    expect(categoryNew.saveLabel).toContain('Category');

    const accountFirst = resolveAccountFormHeroCopy({
      isEditMode: false,
      accountType: AccountType.ASSET,
      hasExistingAccounts: false,
    });
    expect(accountFirst.heroTitle).toContain('First');
  });

  it('returns all eligible parent candidates and excludes accounts with transactions', () => {
    const accounts = [
      { id: 'parent', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: null },
      { id: 'leaf', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: null },
      {
        id: 'child',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: 'parent',
      },
      {
        id: 'busy',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: null,
      },
      {
        id: 'other',
        accountType: AccountType.LIABILITY,
        currencyCode: 'USD',
        parentAccountId: null,
      },
    ] as any[];

    expect(
      filterPotentialParentAccounts(accounts, {
        accountType: AccountType.ASSET,
        hasDirectTransactions: account => account.id === 'busy',
      })
        .map(account => account.id)
        .sort(),
    ).toEqual(['child', 'leaf', 'parent']);

    expect(
      filterPotentialParentAccounts(accounts, {
        accountId: 'parent' as AccountId,
        accountType: AccountType.ASSET,
        hasDirectTransactions: account => account.id === 'busy',
      })
        .map(account => account.id)
        .sort(),
    ).toEqual(['leaf']);

    expect(filterPayFromAccountOptions(accounts, 'parent' as AccountId)).toEqual([
      accounts[1],
      accounts[2],
      accounts[3],
    ]);
    expect(isCategoryAccountType(AccountType.INCOME)).toBe(true);
  });

  describe('resolveAllowedAccountTypes', () => {
    it('returns undefined in edit mode so all types are accessible', () => {
      expect(resolveAllowedAccountTypes({ isEditMode: true, isCategory: false })).toBeUndefined();
      expect(resolveAllowedAccountTypes({ isEditMode: true, isCategory: true })).toBeUndefined();
    });

    it('returns category types for new category creation', () => {
      expect(resolveAllowedAccountTypes({ isEditMode: false, isCategory: true })).toEqual([
        AccountType.EXPENSE,
        AccountType.INCOME,
      ]);
    });

    it('returns balance sheet account types for new account creation', () => {
      expect(resolveAllowedAccountTypes({ isEditMode: false, isCategory: false })).toEqual([
        AccountType.ASSET,
        AccountType.LIABILITY,
        AccountType.EQUITY,
      ]);
    });
  });
});
