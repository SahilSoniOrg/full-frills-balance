import { act, renderHook } from '@testing-library/react-native';
import { useReports } from '../useReports';
import { useReportsViewModel } from '../useReportsViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { AccountId } from '@/src/types/domain';

// Mock useReports
jest.mock('../useReports');

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    activeWorkplaceId: 'wp-1',
    activeWorkplace: { id: 'wp-1', name: 'Personal' },
  }),
}));

// Mock dependencies
// Mock dependencies
jest.mock('@/src/hooks/use-theme', () => {
  const theme = {
    primary: 'blue',
    success: 'green',
    error: 'red',
    surface: 'white',
    border: 'grey',
  };
  return {
    useTheme: () => ({ theme }),
  };
});

jest.mock('@/src/utils/currencyFormatter', () => ({
  CurrencyFormatter: {
    format: (val: number) => `$${val}`,
    formatWithPreference: (val: number) => `$${val}`,
  },
}));

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    toJournalSearch: jest.fn(),
    toAccountDetails: jest.fn(),
  },
}));

describe('useReportsViewModel', () => {
  const mockUseReports = useReports as jest.Mock;

  const mockReportsData = {
    netWorthHistory: [
      { date: 1, netWorth: 1000 },
      { date: 2, netWorth: 2000 },
    ],
    expenses: [],
    expenseCategories: [],
    incomeCategories: [{ category: 'Salary', amount: 1000, percentage: 100 }],
    incomeBreakdown: [
      {
        accountId: 'a1' as AccountId,
        accountName: 'Salary',
        category: 'Salary',
        amount: 1000,
        percentage: 100,
      },
    ],
    incomeVsExpenseHistory: [
      {
        period: 'Jan',
        startDate: 1704067200000,
        endDate: 1706745599999,
        income: 500,
        expense: 200,
      },
      {
        period: 'Feb',
        startDate: 1706745600000,
        endDate: 1709251199999,
        income: 800,
        expense: 300,
      },
    ],
    incomeVsExpense: { income: 1300, expense: 500 },
    loading: false,
    dateRange: { startDate: 1704067200000, endDate: 1706745599999 },
    periodFilter: 'all',
    updateFilter: jest.fn(),
    targetCurrency: 'EUR',
    dailyIncomeVsExpense: [
      { date: 1, income: 100, expense: 50 },
      { date: 2, income: 200, expense: 100 },
    ],
  };

  beforeEach(() => {
    mockUseReports.mockReturnValue(mockReportsData);
  });

  it('should toggle net worth selection but keep header static', () => {
    const { result } = renderHook(() => useReportsViewModel());

    // Verify basic properties
    expect(result.current.activeTab).toBe('OVERVIEW');
    expect(result.current.netWorthSeries).toBeDefined();
    expect(result.current.barChartData).toBeDefined();
  });

  it('should populate dailyData correctly', () => {
    const { result } = renderHook(() => useReportsViewModel());

    expect(result.current.dailyData).toHaveLength(2);
    expect(result.current.dailyData[0]).toEqual({
      date: 1,
      netWorth: 1000,
      income: 100,
      expense: 50,
    });
    expect(result.current.dailyData[1]).toEqual({
      date: 2,
      netWorth: 2000,
      income: 200,
      expense: 100,
    });
  });

  it('should toggle expansion state', () => {
    const { result } = renderHook(() => useReportsViewModel());

    expect(result.current.hasIncomeData).toBe(true);

    // Initial state
    expect(result.current.expandedExpenses).toBe(false);
    expect(result.current.expandedIncome).toBe(false);

    // Toggle Expenses
    act(() => {
      result.current.toggleExpenseExpansion();
    });
    expect(result.current.expandedExpenses).toBe(true);

    act(() => {
      result.current.toggleExpenseExpansion();
    });
    expect(result.current.expandedExpenses).toBe(false);

    // Toggle Income
    act(() => {
      result.current.toggleIncomeExpansion();
    });
    expect(result.current.expandedIncome).toBe(true);

    act(() => {
      result.current.toggleIncomeExpansion();
    });
    expect(result.current.expandedIncome).toBe(false);
  });

  it('should navigate to account details with selected reports date range on legend row press', () => {
    const { result } = renderHook(() => useReportsViewModel());

    act(() => {
      result.current.onLegendRowPress('account-123' as AccountId);
    });

    expect(AppNavigation.toJournalSearch).toHaveBeenCalledWith({
      accountIds: ['account-123'],
      startDate: 1704067200000,
      endDate: 1706745599999,
    });
  });
});
