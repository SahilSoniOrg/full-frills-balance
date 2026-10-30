import { render } from '@/src/utils/test-utils';
import { useBudgetListViewModel } from '@/src/features/budget';
import { usePlannedPayments } from '@/src/features/planned-payments';
import { CommitmentsPage } from '../CommitmentsScreen';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'workplace', defaultCurrencyCode: 'INR' }),
}));
jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
jest.mock('@/src/navigation/primaryPageNavigation', () => ({
  usePrimaryPageNavigation: jest.fn(() => null),
  usePrimaryPageActive: jest.fn(() => true),
  usePrimaryLeafPrepared: jest.fn(() => true),
  usePrimaryPagerNavigation: jest.fn(() => null),
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

beforeEach(() => {
  jest.clearAllMocks();
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
  const screen = render(<CommitmentsPage />);
  expect(screen.queryByRole('button', { name: 'Create a budget' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create a planned payment' })).toBeNull();
});

it('renders and subscribes to the budgets leaf without mounting planned payments', () => {
  const screen = render(<CommitmentsPage />);
  expect(screen.getByText('Budget list')).toBeTruthy();
  expect(useBudgetListViewModel).toHaveBeenCalledWith('workplace', 'INR', true);
  expect(usePlannedPayments).not.toHaveBeenCalled();
});

it('renders the planned-payments leaf without mounting budgets', () => {
  const screen = render(<CommitmentsPage tab="planned" />);
  expect(screen.getByText('Planned list')).toBeTruthy();
  expect(useBudgetListViewModel).not.toHaveBeenCalled();
  expect(usePlannedPayments).toHaveBeenCalledWith('workplace', true);
});
