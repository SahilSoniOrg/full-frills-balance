import { fireEvent, render } from '@/src/utils/test-utils';
import { useBudgetListViewModel } from '@/src/features/budget';
import { usePlannedPayments } from '@/src/features/planned-payments';
import { AppNavigation } from '@/src/utils/navigation';
import { CommitmentsPage } from '../CommitmentsScreen';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace', defaultCurrencyCode: 'INR' }),
}));
jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
jest.mock('@/src/features/commitments/CommitmentsGroupProvider', () => ({
  useCommitmentsBadgeSnapshot: () => ({
    counts: { budgets: 0, planned: 0 },
    updateCount: jest.fn(),
  }),
}));
jest.mock('@/src/navigation/primaryPageNavigation', () => ({
  usePrimaryPageNavigation: () => null,
}));
jest.mock('expo-router', () => ({
  useIsFocused: jest.fn(() => true),
}));

jest.mock('@/src/features/budget', () => ({
  useBudgetListViewModel: jest.fn(),
  BudgetListView: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>Budget list</Text>;
  },
}));
jest.mock('@/src/features/planned-payments', () => ({
  usePlannedPayments: jest.fn(),
  PlannedPaymentListView: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>Planned list</Text>;
  },
}));
jest.mock('@/src/components/layout', () => ({
  ScreenWithChrome: jest.requireActual('@/src/testing/mockTabScreenChrome').MockTabScreenWithChrome,
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    toBudgetForm: jest.fn(),
    toPlannedPaymentForm: jest.fn(),
    toPrimaryPage: jest.fn(),
  },
}));

const { useIsFocused } = jest.requireMock<typeof import('expo-router')>('expo-router');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  jest.mocked(useBudgetListViewModel).mockReturnValue({
    items: [],
    summary: undefined,
    isLoading: false,
    error: null,
    retry: jest.fn(),
    onItemPress: jest.fn(),
    missingRateQuotes: [],
  });
  jest.mocked(usePlannedPayments).mockReturnValue({
    items: [],
    listData: {
      today: 0,
      monthStart: 0,
      nextMonthStart: 1,
      summary: { outgoing: emptyTotals, incoming: emptyTotals, unknownCount: 0 },
      groups: [],
      monthStrip: [],
    },
    isLoading: false,
    error: null,
    retry: jest.fn(),
    onItemPress: jest.fn(),
  });
});

const emptyTotals = {
  perCurrency: [],
  mainCurrency: { currencyCode: 'INR', amount: 0, count: 0 },
  count: 0,
  otherCurrencyCount: 0,
};

it('leaves creation to the contextual Add menu instead of a screen FAB', () => {
  const screen = render(<CommitmentsPage activeTab="budgets" />);
  expect(screen.queryByRole('button', { name: 'Create a budget' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create a planned payment' })).toBeNull();
});

it('enables only the focused matching read pipeline', () => {
  render(<CommitmentsPage activeTab="budgets" />);
  expect(useBudgetListViewModel).toHaveBeenCalledWith('workplace', 'INR', true);
  expect(usePlannedPayments).toHaveBeenCalledWith('workplace', false);

  jest.clearAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(false);
  render(<CommitmentsPage activeTab="planned" />);
  expect(useBudgetListViewModel).toHaveBeenCalledWith('workplace', 'INR', false);
  expect(usePlannedPayments).toHaveBeenCalledWith('workplace', false);
});

it('navigates between Budgets and Planned through primary page routes', () => {
  const screen = render(<CommitmentsPage activeTab="budgets" />);
  expect(screen.getByRole('tab', { name: 'Budgets' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Budget list')).toBeTruthy();

  fireEvent.press(screen.getByRole('tab', { name: 'Planned' }));
  expect(AppNavigation.toPrimaryPage).toHaveBeenCalledWith('planned-payments');
});

it('opens Planned with its own page tab selection', () => {
  const screen = render(<CommitmentsPage activeTab="planned" />);
  expect(screen.getByRole('tab', { name: 'Planned' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Planned list')).toBeTruthy();
  expect(useBudgetListViewModel).toHaveBeenCalledWith('workplace', 'INR', false);
  expect(usePlannedPayments).toHaveBeenCalledWith('workplace', true);

  fireEvent.press(screen.getByRole('tab', { name: 'Budgets' }));
  expect(AppNavigation.toPrimaryPage).toHaveBeenCalledWith('commitments');
});
