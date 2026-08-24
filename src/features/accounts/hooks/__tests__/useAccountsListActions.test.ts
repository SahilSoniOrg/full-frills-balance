import { act, renderHook } from '@testing-library/react-native';
import type { AccountFields } from '@/src/types/plainDtos';
import { useAccountsListActions } from '../useAccountsListActions';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { AppNavigation } from '@/src/utils/navigation';

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    toAccountDetails: jest.fn(),
    toAccountCreation: jest.fn(),
    toCategoryCreation: jest.fn(),
    toAccountManagement: jest.fn(),
  },
}));

describe('useAccountsListActions', () => {
  const parentId = 'parent' as AccountId;
  const childId = 'child' as AccountId;
  const account = (id: AccountId, parentAccountId: AccountId | null = null) =>
    ({
      id,
      parentAccountId,
      name: id,
      currencyCode: 'USD',
      accountType: AccountType.ASSET,
      icon: undefined,
    }) as unknown as AccountFields;

  const balance = {
    accountId: childId,
    balance: 42,
    currencyCode: 'EUR',
  } as AccountBalance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expands a parent before navigating to account details', () => {
    const setExpandedAccountIds = jest.fn();
    const { result } = renderHook(() =>
      useAccountsListActions({
        accounts: [account(parentId), account(childId, parentId)],
        balancesByAccountId: new Map(),
        expandedAccountIds: new Set(),
        setExpandedAccountIds,
        activeTab: 'accounts',
      }),
    );

    act(() => result.current.onAccountPress(parentId));

    expect(setExpandedAccountIds).toHaveBeenCalledTimes(1);
    const update = setExpandedAccountIds.mock.calls[0][0] as (
      previous: Set<AccountId>,
    ) => Set<AccountId>;
    expect(update(new Set())).toEqual(new Set([parentId]));
    expect(AppNavigation.toAccountDetails).not.toHaveBeenCalled();
  });

  it('navigates with the account preview once a parent is expanded', () => {
    const { result } = renderHook(() =>
      useAccountsListActions({
        accounts: [account(parentId), account(childId, parentId)],
        balancesByAccountId: new Map([[childId, balance]]),
        expandedAccountIds: new Set([parentId]),
        setExpandedAccountIds: jest.fn(),
        activeTab: 'accounts',
      }),
    );

    act(() => result.current.onAccountPress(childId));

    expect(AppNavigation.toAccountDetails).toHaveBeenCalledWith(childId, {
      preview: {
        name: childId,
        balance: 42,
        currency: 'EUR',
        icon: 'wallet',
        type: AccountType.ASSET,
      },
    });
  });

  it('routes creation and hierarchy actions by the active tab', () => {
    const input = {
      accounts: [],
      balancesByAccountId: new Map<AccountId, AccountBalance>(),
      expandedAccountIds: new Set<AccountId>(),
      setExpandedAccountIds: jest.fn(),
      activeTab: 'categories' as const,
    };
    const { result } = renderHook(() => useAccountsListActions(input));

    act(() => {
      result.current.onCreateAccount();
      result.current.onManageHierarchy();
    });

    expect(AppNavigation.toCategoryCreation).toHaveBeenCalled();
    expect(AppNavigation.toAccountManagement).toHaveBeenCalledWith({ filterMode: 'categories' });
    expect(AppNavigation.toAccountManagement).toHaveBeenCalledTimes(1);
  });
});
