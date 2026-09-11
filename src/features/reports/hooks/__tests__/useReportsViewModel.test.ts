import { act, renderHook } from '@testing-library/react-native';
import { useReports } from '../useReports';
import { useReportsViewModel } from '../useReportsViewModel';
import { AppNavigation } from '@/src/utils/navigation';
import { AccountId } from '@/src/types/ids';

jest.mock('../useReports');

jest.mock('@/src/services/analytics', () => ({
  analytics: { trackFeatureUsage: jest.fn(), logChartInteracted: jest.fn() },
}));

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: 'wp-1',
    defaultCurrencyCode: 'EUR',
    activeWorkplaceId: 'wp-1',
    activeWorkplace: { id: 'wp-1', name: 'Personal' },
  }),
}));

jest.mock('@/src/contexts/PrivacyScope', () => ({
  usePrivacyScope: () => ({
    isPrivacyMode: false,
    togglePrivacyMode: jest.fn(),
  }),
}));

jest.mock('@/src/hooks/use-theme', () => {
  const theme = {
    primary: 'blue',
    success: 'green',
    error: 'red',
    surface: 'white',
    border: 'grey',
    textSecondary: 'grey',
  };
  return {
    useTheme: () => ({ theme }),
  };
});

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    toJournalSearch: jest.fn(),
    toAccountDetails: jest.fn(),
  },
}));

describe('useReportsViewModel', () => {
  const mockUseReports = useReports as jest.Mock;

  const mockReportsData = {
    accounts: [],
    netWorthHistory: [
      { date: 1, netWorth: 1000, totalAssets: 1200, totalLiabilities: 200 },
      { date: 2, netWorth: 2000, totalAssets: 2200, totalLiabilities: 200 },
    ],
    expenses: [],
    expenseCategories: [
      { category: 'food', amount: 300, percentage: 60, accountIds: ['food-1'] },
      { category: 'travel', amount: 200, percentage: 40, accountIds: ['travel-1'] },
    ],
    incomeCategories: [{ category: 'Salary', amount: 1000, percentage: 100, accountIds: ['a1'] }],
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
    previousIncomeVsExpense: { income: 1000, expense: 400 },
    loading: false,
    dateRange: { startDate: 1704067200000, endDate: 1706745599999 },
    periodFilter: { type: 'ALL' },
    accountIds: [],
    updateFilter: jest.fn(),
    targetCurrency: 'EUR',
    dailyIncomeVsExpense: [
      { date: 1, income: 100, expense: 50 },
      { date: 2, income: 200, expense: 100 },
    ],
    sankeyData: {
      nodes: [],
      links: [],
      summary: { totalIncome: 0, totalExpense: 0, surplus: 0, deficit: 0 },
    },
    spendingHeatmap: [],
    calendarHeatmap: [],
  };

  beforeEach(() => {
    mockUseReports.mockReturnValue(mockReportsData);
    jest.clearAllMocks();
  });

  it('should expose focused tab view-models instead of a flat facade', () => {
    const { result } = renderHook(() => useReportsViewModel());

    expect(result.current.activeTab).toBe('OVERVIEW');
    expect(result.current.filters).toBeDefined();
    expect(result.current.overview.netWorthSeries).toBeDefined();
    expect(result.current.spending).toBeDefined();
    expect(result.current.wealth).toBeDefined();
  });

  it('should expose the answer-first summary and scoped transaction actions', () => {
    const { result } = renderHook(() => useReportsViewModel());

    expect(result.current.overview.summary.income).toBe(1300);
    expect(result.current.overview.summary.expense).toBe(500);
    expect(result.current.overview.summary.netFlow).toBe(800);
    expect(result.current.overview.summary.comparison).toEqual({
      incomeChange: 300,
      expenseChange: 100,
      netFlowChange: 200,
    });
    expect(result.current.overview.summary.largestSpendingCategory).toEqual(
      expect.objectContaining({ category: 'food', amount: 300 }),
    );

    act(() => {
      result.current.overview.summary.onViewIncomeTransactions();
    });

    expect(AppNavigation.toJournalSearch).toHaveBeenCalledWith({
      accountIds: ['a1'],
      startDate: 1704067200000,
      endDate: 1706745599999,
    });

    act(() => {
      result.current.overview.summary.onViewNetFlowTransactions();
    });

    expect(AppNavigation.toJournalSearch).toHaveBeenLastCalledWith({
      accountIds: ['a1', 'food-1', 'travel-1'],
      startDate: 1704067200000,
      endDate: 1706745599999,
    });
  });

  it('should populate dailyData correctly on the wealth tab', () => {
    const { result } = renderHook(() => useReportsViewModel());

    expect(result.current.wealth.dailyData).toHaveLength(2);
    expect(result.current.wealth.dailyData[0]).toEqual({
      date: 1,
      netWorth: 1000,
      income: 100,
      expense: 50,
      assets: 1200,
      liabilities: 200,
    });
    expect(result.current.wealth.dailyData[1]).toEqual({
      date: 2,
      netWorth: 2000,
      income: 200,
      expense: 100,
      assets: 2200,
      liabilities: 200,
    });
  });

  it('should toggle spending expansion state', () => {
    const { result } = renderHook(() => useReportsViewModel());

    expect(result.current.spending.expandedExpenses).toBe(false);

    act(() => {
      result.current.spending.toggleExpenseExpansion();
    });
    expect(result.current.spending.expandedExpenses).toBe(true);

    act(() => {
      result.current.spending.toggleExpenseExpansion();
    });
    expect(result.current.spending.expandedExpenses).toBe(false);
  });

  it('should navigate to journal search with account ids on legend row press', () => {
    const { result } = renderHook(() => useReportsViewModel());

    act(() => {
      result.current.spending.onLegendRowPress(['account-123' as AccountId]);
    });

    expect(AppNavigation.toJournalSearch).toHaveBeenCalledWith({
      accountIds: ['account-123'],
      startDate: 1704067200000,
      endDate: 1706745599999,
    });
  });

  it('should navigate to journal search with category account ids on legend row press', () => {
    mockUseReports.mockReturnValue({
      ...mockReportsData,
      expenseCategories: [
        { category: 'FOOD', amount: 500, percentage: 100, accountIds: ['food-1', 'food-2'] },
      ],
    });

    const { result } = renderHook(() => useReportsViewModel());

    act(() => {
      result.current.spending.onLegendRowPress(['food-1' as AccountId, 'food-2' as AccountId]);
    });

    expect(AppNavigation.toJournalSearch).toHaveBeenCalledWith({
      accountIds: ['food-1', 'food-2'],
      startDate: 1704067200000,
      endDate: 1706745599999,
    });
  });

  it('should expose category account ids on spending category legend rows', () => {
    mockUseReports.mockReturnValue({
      ...mockReportsData,
      expenseCategories: [
        { category: 'FOOD', amount: 500, percentage: 100, accountIds: ['food-1', 'food-2'] },
      ],
    });

    const { result } = renderHook(() => useReportsViewModel());

    expect(result.current.spending.expenseCategoryViewState.legendRows[0]?.accountIds).toEqual([
      'food-1',
      'food-2',
    ]);
  });

  it('should not navigate to journal search when legend row has no account ids', () => {
    const { result } = renderHook(() => useReportsViewModel());

    act(() => {
      result.current.spending.onLegendRowPress([]);
    });

    expect(AppNavigation.toJournalSearch).not.toHaveBeenCalled();
  });
});
