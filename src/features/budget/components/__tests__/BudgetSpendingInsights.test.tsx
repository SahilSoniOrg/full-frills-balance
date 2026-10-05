import { BudgetSpendingInsights } from '../BudgetSpendingInsights';
import { cleanup, fireEvent, render } from '@/src/utils/test-utils';
import { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';
import { View } from 'react-native';

const dining = {
  id: 'dining' as AccountId,
  name: 'Dining',
  accountType: AccountType.EXPENSE,
  currencyCode: 'USD',
};
const groceries = {
  id: 'groceries' as AccountId,
  name: 'Groceries',
  accountType: AccountType.EXPENSE,
  currencyCode: 'USD',
};
const props = {
  chartData: {
    data: [],
    domainX: [1, 2] as [number, number],
    hasUnvaluedEntries: false,
    entryCount: 7,
    refunds: 12.5,
    categories: [
      {
        accountId: dining.id,
        spent: 60,
        refunds: 12.5,
        entryCount: 2,
        hasUnvaluedEntries: false,
      },
      {
        accountId: groceries.id,
        spent: 40,
        refunds: 0,
        entryCount: 5,
        hasUnvaluedEntries: false,
      },
    ],
  },
  isLoading: false,
  currencyCode: 'USD',
  expenseAccounts: [dining, groceries],
  resolvedLeafCategoryCount: 2,
  onFilterCategory: jest.fn(),
  activityCategory: null,
};

describe('budget spending insights', () => {
  beforeEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
    jest.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('opens by default, filters and clears from category rows, and shows nonzero refunds', () => {
    const screen = render(<BudgetSpendingInsights {...props} />);
    expect(screen.getByText('Where it went')).toBeTruthy();
    expect(screen.getByText('$60.00')).toBeTruthy();
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.getByText('$12.50')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Show Dining activity' }));
    expect(props.onFilterCategory).toHaveBeenCalledWith(dining.id);

    screen.rerender(<BudgetSpendingInsights {...props} activityCategory={dining} />);
    fireEvent.press(screen.getByRole('button', { name: 'Clear Dining activity filter' }));
    expect(props.onFilterCategory).toHaveBeenLastCalledWith(null);
  });

  it('uses category shares of total spending and masks values while showing FX detail', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = render(
      <BudgetSpendingInsights
        {...props}
        chartData={{ ...props.chartData, hasUnvaluedEntries: true }}
      />,
    );
    const shareFills = screen.UNSAFE_getAllByType(View);
    expect(
      shareFills.find(node => node.props.testID === 'budget-category-share-dining')?.props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ width: '60%' })]));
    expect(
      shareFills.find(node => node.props.testID === 'budget-category-share-groceries')?.props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ width: '40%' })]));
    expect(screen.getAllByText(AppConfig.privacyMask)).toHaveLength(3);
    expect(screen.getByText(/Category amounts are partial/)).toBeTruthy();
  });

  it('hides the breakdown only when one resolved expense category exists', () => {
    const screen = render(
      <BudgetSpendingInsights
        {...props}
        resolvedLeafCategoryCount={1}
        expenseAccounts={[dining]}
      />,
    );
    expect(screen.queryByText('Where it went')).toBeNull();
  });
});
