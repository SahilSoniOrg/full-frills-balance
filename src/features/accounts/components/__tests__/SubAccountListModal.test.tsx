import { Icon } from '@/src/types/domainIcons';
import type { SubAccountViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { asAccountId } from '@/src/types/ids';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import {
  annotateSubAccountTree,
  SubAccountListModal,
  type SubAccountTreeParent,
} from '@/src/features/accounts/components/SubAccountListModal';
import { useEffect, type ComponentProps } from 'react';

function account(
  partial: { id: string; name: string; level: number } & Partial<
    Pick<SubAccountViewModel, 'isGroup' | 'currencyCode' | 'balanceAmount'>
  >,
): SubAccountViewModel {
  return {
    icon: Icon.Wallet,
    accountType: 'ASSET',
    balanceAmount: 10,
    currencyCode: 'USD',
    categoryColor: '#4F46E5',
    accountColor: '#EEF2FF',
    isGroup: false,
    ...partial,
    id: asAccountId(partial.id),
  };
}

const parent: SubAccountTreeParent = {
  name: 'Household',
  icon: null,
  accountType: 'ASSET',
  balanceAmount: 400,
  currencyCode: 'USD',
};

const nested = [
  account({ id: 'bills', name: 'Bills', level: 0, isGroup: true }),
  account({ id: 'rent', name: 'Rent', level: 1 }),
  account({ id: 'utilities', name: 'Utilities', level: 1 }),
];

function renderSheet(props: Partial<ComponentProps<typeof SubAccountListModal>> = {}) {
  const onOpenAccount = jest.fn();
  render(
    <SubAccountListModal
      visible
      onClose={jest.fn()}
      onOpenAccount={onOpenAccount}
      parent={parent}
      subAccounts={nested}
      isLoading={false}
      {...props}
    />,
  );
  return { onOpenAccount };
}

describe('annotateSubAccountTree', () => {
  it('marks sibling order, direct children, and share within each sibling group', () => {
    const tree = annotateSubAccountTree([
      account({ id: 'bills', name: 'Bills', level: 0, isGroup: true, balanceAmount: 300 }),
      account({ id: 'rent', name: 'Rent', level: 1, balanceAmount: 200 }),
      account({ id: 'utilities', name: 'Utilities', level: 1, balanceAmount: 100 }),
      account({ id: 'cash', name: 'Cash', level: 0, balanceAmount: 100 }),
    ]);

    expect(tree.map(row => [row.id, row.childCount, row.isLastSibling, row.share])).toEqual([
      ['bills', 2, false, 0.75],
      ['rent', 0, false, 2 / 3],
      ['utilities', 0, true, 1 / 3],
      ['cash', 0, true, 0.25],
    ]);
    expect(tree[1].ancestorContinues).toEqual([true]);
    expect(tree[1].ancestorIds).toEqual(['bills']);
  });

  it('continues an ancestor guide only while that ancestor has a later sibling', () => {
    const tree = annotateSubAccountTree([
      account({ id: 'bills', name: 'Bills', level: 0, isGroup: true }),
      account({ id: 'rent', name: 'Rent', level: 1, isGroup: true }),
      account({ id: 'electric', name: 'Electric', level: 2 }),
      account({ id: 'gas', name: 'Gas', level: 2 }),
      account({ id: 'water', name: 'Water', level: 1 }),
    ]);
    const byId = Object.fromEntries(tree.map(row => [row.id, row]));

    expect(byId.electric.ancestorContinues).toEqual([false, true]);
    expect(byId.electric.ancestorIds).toEqual(['bills', 'rent']);
    expect(byId.gas.isLastSibling).toBe(true);
    expect(byId.water.ancestorContinues).toEqual([false]);
    expect(byId.rent.childCount).toBe(2);
  });

  it('skips share for an only child, mixed currencies, or a negative balance', () => {
    expect(
      annotateSubAccountTree([account({ id: 'only', name: 'Only', level: 0 })])[0].share,
    ).toBeNull();
    const mixed = annotateSubAccountTree([
      account({ id: 'usd', name: 'USD', level: 0 }),
      account({ id: 'eur', name: 'EUR', level: 0, currencyCode: 'EUR' }),
    ]);
    const negative = annotateSubAccountTree([
      account({ id: 'card', name: 'Card', level: 0, balanceAmount: -50 }),
      account({ id: 'cash', name: 'Cash', level: 0 }),
    ]);

    expect(mixed.map(row => row.share)).toEqual([null, null]);
    expect(negative.map(row => row.share)).toEqual([null, null]);
  });
});

describe('SubAccountListModal', () => {
  const flat = [
    account({ id: 'federal', name: 'Federal Fi', level: 0, balanceAmount: 100 }),
    account({ id: 'sbi', name: 'SBI Savings', level: 0, balanceAmount: 300 }),
  ];

  it('roots the tree at the parent with its total and links every child to it', () => {
    renderSheet({ subAccounts: flat });

    expect(screen.getByText('Household')).toBeTruthy();
    expect(screen.getByText('2 accounts')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByTestId('sub-account-rail-federal')).toBeTruthy();
    expect(screen.getByLabelText('SBI Savings, level 1, 75% of group')).toBeTruthy();
    expect(
      screen.getByTestId('sub-account-share-sbi', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.queryByTestId('sub-account-toggle-federal')).toBeNull();
  });

  it('opens the tapped account', () => {
    const { onOpenAccount } = renderSheet({ subAccounts: flat });

    fireEvent.press(screen.getByTestId('sub-account-row-sbi'));

    expect(onOpenAccount).toHaveBeenCalledWith(expect.objectContaining({ id: 'sbi' }));
  });

  it('starts groups collapsed and expands them from the chevron without opening', () => {
    const { onOpenAccount } = renderSheet();

    expect(screen.getByText('1 group, 2 accounts')).toBeTruthy();
    expect(screen.getByLabelText('Bills, group, 2 inside, level 1')).toBeTruthy();
    expect(screen.queryByText('Rent')).toBeNull();

    fireEvent.press(screen.getByLabelText('Show accounts in Bills'));

    expect(screen.getByLabelText('Rent, level 2, 50% of group')).toBeTruthy();
    expect(screen.getByLabelText('Hide accounts in Bills')).toBeTruthy();
    expect(onOpenAccount).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Hide accounts in Bills'));

    expect(screen.queryByText('Rent')).toBeNull();
  });

  it('hides share bars in privacy mode', () => {
    function EnablePrivacy() {
      const { togglePrivacyMode } = usePrivacyScope();
      useEffect(() => togglePrivacyMode(), [togglePrivacyMode]);
      return null;
    }

    render(
      <>
        <EnablePrivacy />
        <SubAccountListModal
          visible
          onClose={jest.fn()}
          onOpenAccount={jest.fn()}
          parent={parent}
          subAccounts={flat}
          isLoading={false}
        />
      </>,
    );
    act(() => {});

    expect(
      screen.queryByTestId('sub-account-share-sbi', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.getByLabelText('SBI Savings, level 1')).toBeTruthy();
  });

  it('names the parent when the tree is empty', () => {
    renderSheet({ subAccounts: [] });

    expect(screen.getByText('No accounts under Household')).toBeTruthy();
  });
});
