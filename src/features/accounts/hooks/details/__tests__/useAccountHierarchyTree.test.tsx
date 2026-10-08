import { useAccountHierarchyTree } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { createAccountTreeSnapshot } from '@/src/services/accounts/accountTree';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';
import { AppNavigation } from '@/src/utils/navigation';
import { act, AllTheProviders, renderHook } from '@/src/utils/test-utils';

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toAccountDetails: jest.fn() },
}));

const plain = (id: string, name: string, parentId?: string, archivedAt?: number): PlainAccount => ({
  id: asAccountId(id),
  name,
  accountType: AccountType.ASSET,
  currencyCode: 'INR',
  parentAccountId: parentId ? asAccountId(parentId) : undefined,
  archivedAt,
});

const accounts = [
  plain('household', 'Household'),
  plain('liq', 'Liq', 'household', 1),
  plain('federal', 'Federal Fi', 'liq'),
];

function renderTree(accountId: string) {
  const id = asAccountId(accountId);
  return renderHook(
    () =>
      useAccountHierarchyTree({
        accountId: id,
        account: accounts.find(account => account.id === id) ?? null,
        treeSnapshot: createAccountTreeSnapshot(accounts),
        rawSubBalances: [],
        workplaceCurrency: 'INR',
        dashboardLoading: false,
      }),
    { wrapper: AllTheProviders },
  );
}

describe('useAccountHierarchyTree ancestor path', () => {
  it('lists parents outermost first and marks archived ones', () => {
    const { result } = renderTree('federal');

    expect(result.current.ancestorPath).toEqual([
      { id: 'household', name: 'Household', isArchived: false },
      { id: 'liq', name: 'Liq', isArchived: true },
    ]);
  });

  it('is empty for a top-level account', () => {
    expect(renderTree('household').result.current.ancestorPath).toEqual([]);
  });

  it('opens a parent with a preview of it', () => {
    const { result } = renderTree('federal');

    act(() => result.current.onOpenAncestor(asAccountId('liq')));

    expect(AppNavigation.toAccountDetails).toHaveBeenCalledWith(
      'liq',
      expect.objectContaining({
        preview: expect.objectContaining({ name: 'Liq', currency: 'INR', type: 'ASSET' }),
      }),
    );
  });
});
