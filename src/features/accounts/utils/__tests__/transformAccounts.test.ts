import { Theme } from '@/src/constants/design-tokens';
import { AccountType } from '@/src/data/models/Account';
import { AccountId, PlainAccount } from '@/src/types/domain';
import { transformAccountsToSections } from '../transformAccounts';

describe('transformAccountsToSections', () => {
  const defaultOptions = {
    balancesByAccountId: new Map(),
    defaultCurrency: 'USD',
    showAccountMonthlyStats: false,
    isPrivacyMode: false,
    isLoading: false,
    collapsedSections: new Set<string>(),
    theme: { background: '#ffffff' } as Theme,
    totalAssets: 1000,
    totalLiabilities: 0,
    totalEquity: 0,
    totalIncome: 0,
    totalExpense: 0,
    expandedAccountIds: new Set<string>(),
    onContrast: () => '#000000',
  };

  it('updates the view model icon when the account icon changes', () => {
    const accountV1: PlainAccount = {
      id: 'acc_1' as AccountId,
      name: 'Checking Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      icon: 'wallet',
    };

    const sectionsV1 = transformAccountsToSections([accountV1], defaultOptions);
    const cardV1 = sectionsV1[0].data[0];
    expect(cardV1.icon).toBe('wallet');

    // Update icon to 'creditCard'
    const accountV2: PlainAccount = {
      ...accountV1,
      icon: 'creditCard',
    };

    const sectionsV2 = transformAccountsToSections([accountV2], defaultOptions);
    const cardV2 = sectionsV2[0].data[0];
    expect(cardV2.icon).toBe('creditCard');
  });

  it('updates the view model name when the account name changes', () => {
    const accountV1: PlainAccount = {
      id: 'acc_2' as AccountId,
      name: 'Old Name',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      icon: 'bank',
    };

    const sectionsV1 = transformAccountsToSections([accountV1], defaultOptions);
    expect(sectionsV1[0].data[0].name).toBe('Old Name');

    const accountV2: PlainAccount = {
      ...accountV1,
      name: 'New Name',
    };

    const sectionsV2 = transformAccountsToSections([accountV2], defaultOptions);
    expect(sectionsV2[0].data[0].name).toBe('New Name');
  });

  it('updates hasChildren when a child account is added or removed', () => {
    const parent: PlainAccount = {
      id: 'acc_3' as AccountId,
      name: 'Parent Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      icon: 'bank',
    };

    const withoutChild = transformAccountsToSections([parent], defaultOptions);
    expect(withoutChild[0].data[0].hasChildren).toBe(false);

    // Child writes don't bump the parent's updatedAt, so this must bust the cache by key
    const child: PlainAccount = {
      id: 'acc_4' as AccountId,
      name: 'Child Account',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      icon: 'wallet',
      parentAccountId: parent.id,
    };

    const withChild = transformAccountsToSections([parent, child], defaultOptions);
    expect(withChild[0].data[0].hasChildren).toBe(true);

    const childRemoved = transformAccountsToSections([parent], defaultOptions);
    expect(childRemoved[0].data[0].hasChildren).toBe(false);
  });
});
