import { render } from '@/src/utils/test-utils';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asBudgetId } from '@/src/types/ids';
import type { BudgetItem } from '../../types';
import { BudgetListView } from '../BudgetListView';

jest.mock('@shopify/flash-list', () => {
  const { FlatList } = jest.requireActual<typeof import('react-native')>('react-native');
  return { FlashList: FlatList };
});

const item: BudgetItem = {
  budget: {
    id: asBudgetId('food'),
    name: 'Food',
    amount: 9000,
    currencyCode: 'INR',
    intervalType: 'MONTHLY',
    intervalN: 1,
    recurrenceDay: 1,
  },
  usage: { spent: 3000, remaining: 6000, budgetAmount: 9000, usagePercent: 1 / 3 },
  scopeAccounts: [
    {
      id: asAccountId('food'),
      name: 'Food',
      currencyCode: 'INR',
      accountType: AccountType.EXPENSE,
    },
  ],
};

it('labels the budget section This month', () => {
  const screen = render(
    <BudgetListView
      items={[item]}
      isLoading={false}
      error={null}
      onRetry={jest.fn()}
      onItemPress={jest.fn()}
    />,
  );

  expect(screen.getByText('This month')).toBeTruthy();
});
