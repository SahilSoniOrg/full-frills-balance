import { BulkRenameAccountsModal } from '../BulkRenameAccountsModal';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { AccountType, AccountId } from '@/src/types/domain';
import { act, fireEvent, render } from '@/src/utils/test-utils';

const mockAccounts: AccountCardViewModel[] = [
  {
    id: 'acc-1' as AccountId,
    name: 'Checking Account',
    accountType: AccountType.ASSET,
    balance: 1000,
    currencyCode: 'USD',
    depth: 0,
    icon: 'wallet',
    categoryColor: '#4F46E5',
    accountColor: '#EEF2FF',
    textColor: '#1E1B4B',
    hasChildren: false,
    isExpanded: false,
    isArchived: false,
    showMonthlyStats: false,
    monthlyIncome: 0,
    monthlyExpenses: 0,
  },
  {
    id: 'acc-2' as AccountId,
    name: 'Savings Account',
    accountType: AccountType.ASSET,
    balance: 5000,
    currencyCode: 'USD',
    depth: 0,
    icon: 'bank',
    categoryColor: '#4F46E5',
    accountColor: '#EEF2FF',
    textColor: '#1E1B4B',
    hasChildren: false,
    isExpanded: false,
    isArchived: false,
    showMonthlyStats: false,
    monthlyIncome: 0,
    monthlyExpenses: 0,
  },
];

describe('BulkRenameAccountsModal', () => {
  it('renders pre-populated names and fires onSave with modified names', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    const { getByDisplayValue, getByText } = render(
      <BulkRenameAccountsModal
        visible={true}
        accounts={mockAccounts}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    const checkingInput = getByDisplayValue('Checking Account');
    expect(checkingInput).toBeTruthy();

    fireEvent.changeText(checkingInput, 'Primary Checking');
    await act(async () => {
      fireEvent.press(getByText('Save Changes'));
    });

    expect(onSave).toHaveBeenCalledWith({
      'acc-1': 'Primary Checking',
      'acc-2': 'Savings Account',
    });
  });

  it('discards edits when the modal is closed without saving', () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const view = render(
      <BulkRenameAccountsModal
        visible={true}
        accounts={mockAccounts}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.changeText(view.getByDisplayValue('Checking Account'), 'Abandoned Edit');
    fireEvent.press(view.getByLabelText('Cancel rename'));
    view.rerender(
      <BulkRenameAccountsModal
        visible={false}
        accounts={mockAccounts}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    view.rerender(
      <BulkRenameAccountsModal
        visible={true}
        accounts={mockAccounts}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    expect(view.getByDisplayValue('Checking Account')).toBeTruthy();
  });

  it('keeps modal open and preserves draft when onSave throws or rejects', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('Duplicate name'));
    const onClose = jest.fn();
    const view = render(
      <BulkRenameAccountsModal
        visible={true}
        accounts={mockAccounts}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    const checkingInput = view.getByDisplayValue('Checking Account');
    fireEvent.changeText(checkingInput, 'Duplicate Name');

    await act(async () => {
      fireEvent.press(view.getByText('Save Changes'));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(view.getByDisplayValue('Duplicate Name')).toBeTruthy();
  });
});
