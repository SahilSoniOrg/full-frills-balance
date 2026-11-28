import { fireEvent, render, screen } from '@/src/testing/render';
import { SplitForm } from '../components/SplitForm';
import type { SplitJournalController } from '../modes/split/splitJournalState';
import { asAccountId } from '@/src/types/ids';

jest.mock('../components/AccountPickerField', () => ({ AccountPickerField: () => null }));
jest.mock('../components/AllocationSection', () => ({
  AllocationActions: () => null,
  AllocationRows: () => null,
  AllocationSection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AllocationStatusText: () => null,
  useExclusivePicker: () => ({
    isExpanded: () => false,
    toggle: jest.fn(),
    close: jest.fn(),
    closeIf: jest.fn(),
  }),
}));

const id = asAccountId('personal');
const personAccountId = asAccountId('person-account');

describe('SplitForm people', () => {
  it('renders participants below source and adds the remainder to the personal row', () => {
    const updateSplitRow = jest.fn();
    const controller = {
      totalAmount: '20',
      setTotalAmount: jest.fn(),
      transactionType: 'expense',
      setTransactionType: jest.fn(),
      splits: [
        { id: '1', accountId: personAccountId, amount: '5', exchangeRate: '' },
        { id: '2', accountId: id, amount: '5', exchangeRate: '' },
      ],
      splitFx: {},
      sourceFx: {},
      canEqualize: true,
      addSplitRow: jest.fn(),
      addSplitRowWithAccount: jest.fn(),
      removeSplitRow: jest.fn(),
      updateSplitRow,
      updateSplitAmounts: jest.fn(),
      updateAmount: jest.fn(),
      updateConvertedAmount: jest.fn(),
      resetRate: jest.fn(),
      updateSourceConvertedAmount: jest.fn(),
      resetSourceRate: jest.fn(),
      totals: { total: 20, remaining: 15 },
      currencyContext: {},
      validationError: null,
      allAccounts: [],
      sourceAccounts: [],
      allocationAccounts: [],
      sourceAccount: undefined,
      setSourceAccountId: jest.fn(),
      displayCurrency: 'USD',
      precision: 2,
    } as unknown as SplitJournalController;
    render(
      <SplitForm
        {...controller}
        people={[{ id: 'p' as never, name: 'Alex' }]}
        peopleGroups={[{ personId: 'p', personName: 'Alex', accountIds: [personAccountId] }]}
        onCreateAccountRequestForRow={jest.fn()}
      />,
    );
    expect(screen.getByText('Participants')).toBeTruthy();
    fireEvent.press(screen.getByTestId('split-add-remaining'));
    expect(updateSplitRow).toHaveBeenCalledWith('2', { amount: '20.00' });
  });
});
