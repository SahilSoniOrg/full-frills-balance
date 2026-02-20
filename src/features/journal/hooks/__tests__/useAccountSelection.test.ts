import { AccountType } from '@/src/data/models/Account';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import { renderHook } from '@testing-library/react-native';

// Mock getAccountSections as it's not the focus of this test
jest.mock('@/src/utils/accountUtils', () => ({
    getAccountSections: jest.fn((accounts) => [{ title: 'All', data: accounts }]),
    getAccountVariant: jest.fn(),
    getSectionColor: jest.fn(),
}));

describe('useAccountSelection', () => {
    const mockAccounts = [
        { id: 'parent1', name: 'Parent 1', accountType: AccountType.ASSET, parentAccountId: undefined },
        { id: 'child1', name: 'Child 1', accountType: AccountType.ASSET, parentAccountId: 'parent1' },
        { id: 'grandchild1', name: 'Grandchild 1', accountType: AccountType.ASSET, parentAccountId: 'child1' },
        { id: 'leaf1', name: 'Leaf 1', accountType: AccountType.EXPENSE, parentAccountId: undefined },
        { id: 'parent2', name: 'Parent 2', accountType: AccountType.LIABILITY, parentAccountId: undefined },
        { id: 'child2', name: 'Child 2', accountType: AccountType.LIABILITY, parentAccountId: 'parent2' },
    ] as any[];

    it('should filter out accounts that are parents of other accounts in the list', () => {
        const { result } = renderHook(() => useAccountSelection({ accounts: mockAccounts }));

        // parent1 is parent of child1
        // child1 is parent of grandchild1
        // parent2 is parent of child2
        // leaf1 is a leaf
        // grandchild1 is a leaf
        // child2 is a leaf (in this list, it has no children)

        expect(result.current.transactionAccounts.map(a => a.id)).toEqual(
            expect.arrayContaining(['grandchild1', 'child2'])
        );
        expect(result.current.transactionAccounts.map(a => a.id)).not.toContain('parent1');
        expect(result.current.transactionAccounts.map(a => a.id)).not.toContain('child1');
        expect(result.current.transactionAccounts.map(a => a.id)).not.toContain('parent2');

        expect(result.current.expenseAccounts.map(a => a.id)).toEqual(['leaf1']);
    });

    it('should handle empty account list', () => {
        const { result } = renderHook(() => useAccountSelection({ accounts: [] }));
        expect(result.current.transactionAccounts).toEqual([]);
        expect(result.current.expenseAccounts).toEqual([]);
        expect(result.current.incomeAccounts).toEqual([]);
    });
});
