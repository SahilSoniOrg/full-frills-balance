import { fireEvent, render } from '@/src/utils/test-utils';
import { useBudgetListViewModel } from '@/src/features/budget';
import { usePlannedPayments } from '@/src/features/planned-payments';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppNavigation } from '@/src/utils/navigation';
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
  });
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(useBudgetListViewModel).mockReturnValue({
    items: [],
    summary: undefined,
    isLoading: false,
    error: null,
    retry: jest.fn(),
    onItemPress: jest.fn(),
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

it('defaults unknown routes to Budgets and preserves tab navigation', () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ tab: 'unknown' });
  const screen = render(<CommitmentsScreen />);
  expect(screen.getByRole('tab', { name: 'Budgets' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Budget list')).toBeTruthy();
  expect(screen.getAllByText('0')).toHaveLength(2);
  fireEvent.press(screen.getByRole('tab', { name: 'Planned' }));
  expect(useRouter().setParams).toHaveBeenCalledWith({ tab: 'planned' });
  fireEvent.press(screen.getByRole('button', { name: 'Create a budget' }));
  expect(AppNavigation.toBudgetForm).toHaveBeenCalledTimes(1);
});

it('opens Planned directly from the route and creates the matching commitment', () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ tab: 'planned' });
  const screen = render(<CommitmentsScreen />);
  expect(screen.getByRole('tab', { name: 'Planned' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Planned list')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: 'Budgets' }));
  expect(useRouter().setParams).toHaveBeenCalledWith({ tab: 'budgets' });
  fireEvent.press(screen.getByRole('button', { name: 'Create a planned payment' }));
  expect(AppNavigation.toPlannedPaymentForm).toHaveBeenCalledTimes(1);
});
