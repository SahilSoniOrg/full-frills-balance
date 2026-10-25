import { fireEvent, render } from '@/src/utils/test-utils';
import { useBudgetListViewModel } from '@/src/features/budget';
import { usePlannedPayments } from '@/src/features/planned-payments';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CommitmentsScreen from '../CommitmentsScreen';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace', defaultCurrencyCode: 'INR' }),
}));
jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

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
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(), useRouter: jest.fn() }));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toBudgetForm: jest.fn(), toPlannedPaymentForm: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useRouter).mockReturnValue({
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
    canDismiss: jest.fn(),
    prefetch: jest.fn(),
    reload: jest.fn(),
    setTransitionMode: jest.fn(),
  });
  jest.mocked(useLocalSearchParams).mockReturnValue({});
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

const withItems = <T extends { items: unknown[] }>(model: T) => ({ ...model, items: [{}] });

it('leaves creation to the contextual Add menu instead of a screen FAB', () => {
  const screen = render(<CommitmentsScreen />);
  expect(screen.queryByRole('button', { name: 'Create a budget' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create a planned payment' })).toBeNull();
});

it('defaults unknown routes to Budgets and preserves tab navigation', () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ tab: 'unknown' });
  jest
    .mocked(useBudgetListViewModel)
    .mockReturnValue(withItems(jest.mocked(useBudgetListViewModel)(0 as never, 'INR')) as never);
  const screen = render(<CommitmentsScreen />);
  expect(screen.getByRole('tab', { name: 'Budgets' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Budget list')).toBeTruthy();
  expect(screen.getAllByText('0')).toHaveLength(1);
  fireEvent.press(screen.getByRole('tab', { name: 'Planned' }));
  expect(useRouter().setParams).toHaveBeenCalledWith({ tab: 'planned' });
});

it('opens Planned directly from the route', () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ tab: 'planned' });
  jest
    .mocked(usePlannedPayments)
    .mockReturnValue(withItems(jest.mocked(usePlannedPayments)(0 as never)) as never);
  const screen = render(<CommitmentsScreen />);
  expect(screen.getByRole('tab', { name: 'Planned' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Planned list')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: 'Budgets' }));
  expect(useRouter().setParams).toHaveBeenCalledWith({ tab: 'budgets' });
});
