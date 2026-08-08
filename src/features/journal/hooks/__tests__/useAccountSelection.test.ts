import { AccountId, AccountType } from '@/src/types/domain';

import { ArchiveVisibilityScopeProvider } from '@/src/contexts/ArchiveVisibilityScope';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import { renderHook } from '@testing-library/react-native';

// Mock getAccountSections as it's not the focus of this test
jest.mock('@/src/utils/accountCategory', () => {
  const actual = jest.requireActual('@/src/utils/accountCategory');
  return {
    ...actual,
    getAccountSections: jest.fn(accounts => [{ title: 'All', data: accounts }]),
  };
});

describe('useAccountSelection', () => {
  const mockAccounts = [
    { id: 'parent1', name: 'Parent 1', accountType: AccountType.ASSET, parentAccountId: undefined },
    { id: 'child1', name: 'Child 1', accountType: AccountType.ASSET, parentAccountId: 'parent1' },
    {
      id: 'grandchild1',
      name: 'Grandchild 1',
      accountType: AccountType.ASSET,
      parentAccountId: 'child1',
    },
    { id: 'leaf1', name: 'Leaf 1', accountType: AccountType.EXPENSE, parentAccountId: undefined },
    {
      id: 'parent2',
      name: 'Parent 2',
      accountType: AccountType.LIABILITY,
      parentAccountId: undefined,
    },
    {
      id: 'child2',
      name: 'Child 2',
      accountType: AccountType.LIABILITY,
      parentAccountId: 'parent2',
    },
  ] as any[];

  it('exposes filter buckets without selection state', () => {
    const { result } = renderHook(() => useAccountSelection({ accounts: mockAccounts }));

    expect(result.current).not.toHaveProperty('selectedId');
    expect(result.current).not.toHaveProperty('handleSelect');
    expect(result.current).not.toHaveProperty('setSelectedId');
    expect(result.current.transactionAccounts).toBeDefined();
    expect(result.current.leafAccounts).toBeDefined();
  });

  it('should filter out accounts that are parents of other accounts in the list', () => {
    const { result } = renderHook(() => useAccountSelection({ accounts: mockAccounts }));

    // parent1 is parent of child1
    // child1 is parent of grandchild1
    // parent2 is parent of child2
    // leaf1 is a leaf
    // grandchild1 is a leaf
    // child2 is a leaf (in this list, it has no children)

    expect(result.current.transactionAccounts.map(a => a.id)).toEqual(
      expect.arrayContaining(['grandchild1', 'child2']),
    );
    expect(result.current.transactionAccounts.map(a => a.id)).not.toContain('parent1');
    expect(result.current.transactionAccounts.map(a => a.id)).not.toContain('child1');
    expect(result.current.transactionAccounts.map(a => a.id)).not.toContain('parent2');

    expect(result.current.expenseAccounts.map(a => a.id)).toEqual(['leaf1']);
  });

  it('should include equity accounts in transactionAccounts', () => {
    const accountsWithEquity = [
      ...mockAccounts,
      {
        id: 'equity1',
        name: 'Equity 1',
        accountType: AccountType.EQUITY,
        parentAccountId: undefined,
      },
    ];
    const { result } = renderHook(() => useAccountSelection({ accounts: accountsWithEquity }));

    expect(result.current.transactionAccounts.map(a => a.id)).toContain('equity1');
  });

  it('should provide all leaf accounts in leafAccounts', () => {
    const { result } = renderHook(() => useAccountSelection({ accounts: mockAccounts }));

    // grandchild1 (Asset), leaf1 (Expense), child2 (Liability) are all leaves
    expect(result.current.leafAccounts.map(a => a.id)).toEqual(
      expect.arrayContaining(['grandchild1', 'leaf1', 'child2']),
    );
    expect(result.current.leafAccounts.length).toBe(3);
  });

  it('should handle empty account list', () => {
    const { result } = renderHook(() => useAccountSelection({ accounts: [] }));
    expect(result.current.transactionAccounts).toEqual([]);
    expect(result.current.expenseAccounts).toEqual([]);
    expect(result.current.incomeAccounts).toEqual([]);
    expect(result.current.leafAccounts).toEqual([]);
  });

  it('hides archived leaf accounts unless pinned', () => {
    const accounts = [
      {
        id: 'active',
        name: 'Active',
        accountType: AccountType.EXPENSE,
        parentAccountId: undefined,
      },
      {
        id: 'archived',
        name: 'Archived',
        accountType: AccountType.EXPENSE,
        parentAccountId: undefined,
        archivedAt: new Date('2024-01-01'),
      },
    ] as any[];

    const { result } = renderHook(() => useAccountSelection({ accounts }), {
      wrapper: ArchiveVisibilityScopeProvider,
    });

    expect(result.current.expenseAccounts.map(a => a.id)).toEqual(['active']);

    const { result: pinnedResult } = renderHook(
      () =>
        useAccountSelection({
          accounts,
          pinnedAccountIds: new Set<AccountId>(['archived' as AccountId]),
        }),
      { wrapper: ArchiveVisibilityScopeProvider },
    );

    expect(pinnedResult.current.expenseAccounts.map(a => a.id)).toEqual(
      expect.arrayContaining(['active', 'archived']),
    );
  });
});
