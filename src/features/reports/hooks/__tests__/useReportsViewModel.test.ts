import { reportService } from '@/src/services/report-service';
import { act, renderHook } from '@testing-library/react-native';
import { useReports } from '../useReports';
import { useReportsViewModel } from '../useReportsViewModel';

// Mock useReports
jest.mock('../useReports');

// Mock dependencies
// Mock dependencies
jest.mock('@/src/hooks/use-theme', () => {
    const theme = { primary: 'blue', success: 'green', error: 'red', surface: 'white', border: 'grey' };
    return {
        useTheme: () => ({ theme }),
    };
});

jest.mock('@/src/utils/currencyFormatter', () => ({
    CurrencyFormatter: {
        formatWithPreference: (val: number) => `$${val}`,
    },
}));

// Mock reportService
jest.mock('@/src/services/report-service', () => ({
    reportService: {
        getExpenseBreakdown: jest.fn().mockResolvedValue([]),
        getIncomeBreakdown: jest.fn().mockResolvedValue([]),
    },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: mockPush }),
}));

describe('useReportsViewModel', () => {
    const mockUseReports = useReports as jest.Mock;

    const mockReportsData = {
        netWorthHistory: [{ date: 1, netWorth: 1000 }, { date: 2, netWorth: 2000 }],
        expenses: [],
        incomeBreakdown: [],
        incomeVsExpenseHistory: [
            { period: 'Jan', startDate: 1704067200000, endDate: 1706745599999, income: 500, expense: 200 },
            { period: 'Feb', startDate: 1706745600000, endDate: 1709251199999, income: 800, expense: 300 },
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
        mockPush.mockClear();
        (reportService.getExpenseBreakdown as jest.Mock).mockClear();
        (reportService.getIncomeBreakdown as jest.Mock).mockClear();
        mockUseReports.mockReturnValue(mockReportsData);
    });

    it('should toggle net worth selection but keep header static', () => {
        const { result } = renderHook(() => useReportsViewModel());

        // Initial state: current net worth
        expect(result.current.displayedNetWorthText).toBe('$2000');
        expect(result.current.selectedNetWorthIndex).toBeUndefined();

        // Select index 0
        act(() => {
            result.current.onNetWorthPointSelect(0);
        });

        expect(result.current.selectedNetWorthIndex).toBe(0);
        // Requirement changed: Header should NOT update on selection
        expect(result.current.displayedNetWorthText).toBe('$2000');

        // Toggle off
        act(() => {
            result.current.onNetWorthPointSelect(0);
        });

        expect(result.current.selectedNetWorthIndex).toBeUndefined();
        expect(result.current.displayedNetWorthText).toBe('$2000');
    });

    it('should populate dailyData correctly', () => {
        const { result } = renderHook(() => useReportsViewModel());

        expect(result.current.dailyData).toHaveLength(2);
        expect(result.current.dailyData[0]).toEqual({
            date: 1,
            netWorth: 1000,
            income: 100,
            expense: 50
        });
        expect(result.current.dailyData[1]).toEqual({
            date: 2,
            netWorth: 2000,
            income: 200,
            expense: 100
        });
    });

    it('should toggle income/expense selection', async () => {
        const { result } = renderHook(() => useReportsViewModel());

        // Initial state: total income/expense
        expect(result.current.displayedIncomeText).toBe('$1300');
        expect(result.current.displayedExpenseText).toBe('$500');

        // Select index 1 (Feb)
        await act(async () => {
            result.current.onIncomeExpensePointSelect(1);
        });

        expect(result.current.selectedIncomeExpenseIndex).toBe(1);
        expect(result.current.displayedIncomeText).toBe('$800');
        expect(result.current.displayedExpenseText).toBe('$300');

        // Toggle off
        await act(async () => {
            result.current.onIncomeExpensePointSelect(1);
        });

        expect(result.current.displayedIncomeText).toBe('$1300');
    });

    it('should navigate to transactions with correct dates when view clicked', async () => {
        const { result } = renderHook(() => useReportsViewModel());

        await act(async () => {
            result.current.onIncomeExpensePointSelect(1);
        });

        const router = { push: mockPush }; // mockPush is already the push function of the mocked useRouter

        act(() => {
            result.current.onViewSelectedTransactions();
        });

        const selected = mockReportsData.incomeVsExpenseHistory[1];
        const expectedStartDate = new Date(selected.startDate).setHours(0, 0, 0, 0).toString();
        const expectedEndDate = new Date(selected.endDate).setHours(23, 59, 59, 999).toString();

        expect(router.push).toHaveBeenCalledWith(expect.objectContaining({
            pathname: '/journal',
            params: {
                startDate: expectedStartDate,
                endDate: expectedEndDate,
            },
        }));
    });

    it('should toggle expansion state', () => {
        const { result } = renderHook(() => useReportsViewModel());

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
            result.current.onLegendRowPress('account-123');
        });

        expect(mockPush).toHaveBeenCalledWith({
            pathname: '/account-details',
            params: {
                accountId: 'account-123',
                startDate: '1704067200000',
                endDate: '1706745599999',
            },
        });
    });

    it('should navigate to account details with selected bucket range after bar selection', async () => {
        const { result } = renderHook(() => useReportsViewModel());

        await act(async () => {
            result.current.onIncomeExpensePointSelect(1);
        });

        act(() => {
            result.current.onLegendRowPress('account-123');
        });

        const selected = mockReportsData.incomeVsExpenseHistory[1];
        expect(mockPush).toHaveBeenCalledWith({
            pathname: '/account-details',
            params: {
                accountId: 'account-123',
                startDate: selected.startDate.toString(),
                endDate: selected.endDate.toString(),
            },
        });
    });

    it('should fetch selected-period breakdown using reports target currency', async () => {
        const { result } = renderHook(() => useReportsViewModel());

        await act(async () => {
            result.current.onIncomeExpensePointSelect(1);
        });

        const selected = mockReportsData.incomeVsExpenseHistory[1];
        expect(reportService.getExpenseBreakdown).toHaveBeenCalledWith(
            selected.startDate,
            selected.endDate,
            'EUR'
        );
        expect(reportService.getIncomeBreakdown).toHaveBeenCalledWith(
            selected.startDate,
            selected.endDate,
            'EUR'
        );
    });
});
