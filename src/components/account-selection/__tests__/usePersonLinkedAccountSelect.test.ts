import { act, renderHook } from '@testing-library/react-native';
import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { usePersonLinkedAccountSelect } from '../usePersonLinkedAccountSelect';

const expense: AccountFields = {
  id: asAccountId('dad-expense'),
  name: 'Dad',
  accountType: AccountType.EXPENSE,
  currencyCode: 'INR',
};
const receivable: AccountFields = {
  id: asAccountId('dad-recv'),
  name: 'Dad (Receivable · INR)',
  accountType: AccountType.ASSET,
  currencyCode: 'INR',
};
const people = [
  {
    personId: 'dad-id',
    personName: 'Dad',
    accountIds: [expense.id, receivable.id],
  },
] as const;

describe('usePersonLinkedAccountSelect', () => {
  it('selects immediately when the person has one linked account', () => {
    const onSelect = jest.fn();
    const { result } = renderHook(() =>
      usePersonLinkedAccountSelect({
        accounts: [expense],
        peopleGroups: [{ ...people[0], accountIds: [expense.id] }],
        onSelect,
      }),
    );
    act(() => result.current.selectAccount(expense.id));
    expect(onSelect).toHaveBeenCalledWith(expense.id);
    expect(result.current.chooserVisible).toBe(false);
  });

  it('opens a chooser when the person has multiple linked accounts', () => {
    const onSelect = jest.fn();
    const { result } = renderHook(() =>
      usePersonLinkedAccountSelect({
        accounts: [expense, receivable],
        peopleGroups: people,
        onSelect,
      }),
    );
    act(() => result.current.selectAccount(receivable.id));
    expect(onSelect).not.toHaveBeenCalled();
    expect(result.current.chooserVisible).toBe(true);
    expect(result.current.chooserAccounts.map(account => account.id)).toEqual([
      expense.id,
      receivable.id,
    ]);
    act(() => result.current.confirmChooserAccount(expense.id));
    expect(onSelect).toHaveBeenCalledWith(expense.id);
    expect(result.current.chooserVisible).toBe(false);
  });
});
