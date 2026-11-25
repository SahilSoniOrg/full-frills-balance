import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';

import {
  filterPayFromAccountOptions,
  filterPotentialParentAccounts,
  isCategoryAccountType,
  resolveAccountFormHeroCopy,
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

  it('resolveAccountFormHeroCopy uses New X / Edit X titles', () => {
    const categoryNew = resolveAccountFormHeroCopy({
      isEditMode: false,
      accountType: AccountType.EXPENSE,
    });
    expect(categoryNew.heroTitle).toBe('New Category');
    expect(categoryNew.saveLabel).toContain('Category');

    const accountNew = resolveAccountFormHeroCopy({
      isEditMode: false,
      accountType: AccountType.ASSET,
    });
    expect(accountNew.heroTitle).toBe('New Account');

    const accountEdit = resolveAccountFormHeroCopy({
      isEditMode: true,
      accountType: AccountType.ASSET,
    });
    expect(accountEdit.heroTitle).toBe('Edit Account');
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
});
