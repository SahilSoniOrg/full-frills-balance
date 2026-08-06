import { AccountType, AccountId } from '@/src/types/domain';

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

  it('filters parent and pay-from account options', () => {
    const accounts = [
      { id: 'a1', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: null },
      { id: 'a2', accountType: AccountType.ASSET, currencyCode: 'USD', parentAccountId: 'p' },
      { id: 'a3', accountType: AccountType.LIABILITY, currencyCode: 'USD', parentAccountId: null },
    ] as any[];

    expect(
      filterPotentialParentAccounts(accounts, {
        accountId: 'a1' as AccountId,
        accountType: AccountType.ASSET,
        selectedCurrency: 'USD',
      }),
    ).toHaveLength(0);

    expect(filterPayFromAccountOptions(accounts, 'a1' as AccountId)).toEqual([accounts[1]]);
    expect(isCategoryAccountType(AccountType.INCOME)).toBe(true);
  });
});
