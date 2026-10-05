import { fireEvent, render } from '@/src/utils/test-utils';
import { BudgetSetupDisclosure } from '../BudgetSetupDisclosure';
import { AccountType } from '@/src/types/enums';
import { AccountId, BudgetId } from '@/src/types/ids';

const setupProps = {
  budget: { id: 'food' as BudgetId, name: 'Food', amount: 500.75, currencyCode: 'USD' },
  periodRange: {
    startDate: new Date(2026, 9, 1).getTime(),
    endDate: new Date(2026, 9, 31, 23, 59).getTime(),
  },
  scopeAccounts: [
    {
      id: 'dining' as AccountId,
      name: 'Dining out',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    },
  ],
  fundingAccounts: [],
  isLoadingFunding: false,
  onEdit: jest.fn(),
};

describe('BudgetSetupDisclosure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders setup as one edit row using the funding-account summary', () => {
    const screen = render(<BudgetSetupDisclosure {...setupProps} />);
    const setup = screen.getByRole('button', {
      name: /Setup · Monthly · from Automatic account selection/,
    });
    fireEvent.press(setup);
    expect(setupProps.onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Expense categories')).toBeNull();
  });
});
