import { act, renderHook } from '@testing-library/react-native';
import { useJournalListViewModel } from '../useJournalListViewModel';

// Purely mock everything to avoid model compilation issues
jest.mock('@/src/features/journal/hooks/useJournals', () => ({
    useJournals: jest.fn()
}));

jest.mock('@/src/hooks/useDateRangeFilter', () => ({
    useDateRangeFilter: () => ({
        dateRange: null,
        periodFilter: 'MONTH',
        isPickerVisible: false,
        showPicker: jest.fn(),
        hidePicker: jest.fn(),
        setFilter: jest.fn(),
        navigatePrevious: jest.fn(),
        navigateNext: jest.fn(),
    })
}));

jest.mock('@/src/utils/navigation', () => ({
    AppNavigation: { toTransactionDetails: jest.fn() }
}));

jest.mock('@/src/utils/logger', () => ({
    logger: { warn: jest.fn() }
}));

jest.mock('@/src/constants', () => ({
    AppConfig: {
        defaultCurrency: 'USD',
        defaultCurrencyPrecision: 2,
        strings: {
            common: { loading: 'Loading' },
            journal: {
                from: 'From: ',
                to: 'To: ',
                transaction: 'Transaction',
                transfer: 'Transfer',
                transactionCount: (c: number) => `${c} transactions`,
                errors: {
                    missingExchangeRate: (f: string, t: string) => `Missing ${f} to ${t}`
                }
            }
        }
    }
}));

// Mock safeAdd/safeSubtract
jest.mock('@/src/utils/money', () => ({
    safeAdd: (a: number, b: number) => a + b,
    safeSubtract: (a: number, b: number) => a - b
}));

// Use date components to avoid timezone shift
const mockEnrichedJournals = [
    {
        id: 'j1',
        journalDate: new Date(2024, 2, 20, 10).getTime(), // March 20
        displayType: 'INCOME',
        totalAmount: 100,
        currencyCode: 'USD',
        description: 'Salary',
        accounts: [{ name: 'Bank', role: 'DESTINATION', accountType: 'ASSET' }]
    },
    {
        id: 'j2',
        journalDate: new Date(2024, 2, 20, 15).getTime(),
        displayType: 'EXPENSE',
        totalAmount: 20,
        currencyCode: 'USD',
        description: 'Coffee',
        accounts: [{ name: 'Cash', role: 'SOURCE', accountType: 'ASSET' }]
    },
    {
        id: 'j3',
        journalDate: new Date(2024, 2, 21, 9).getTime(), // March 21
        displayType: 'EXPENSE',
        totalAmount: 50,
        currencyCode: 'EUR',
        description: 'Lunch',
        accounts: [{ name: 'Card', role: 'SOURCE', accountType: 'ASSET' }]
    }
];

describe('useJournalListViewModel', () => {
    const useJournalsMock = require('@/src/features/journal/hooks/useJournals').useJournals;

    beforeEach(() => {
        jest.clearAllMocks();
        useJournalsMock.mockReturnValue({
            journals: mockEnrichedJournals,
            isLoading: false,
            isLoadingMore: false,
            hasMore: true,
            loadMore: jest.fn()
        });
    });

    it('should group journals by date and inject separators', () => {
        const { result } = renderHook(() => useJournalListViewModel({
            emptyState: { title: 'Empty', subtitle: 'None' }
        }));

        const items = result.current.items;

        // Items order in ViewModel follows 'days' order, which follows journals loop
        // journals are j1(20), j2(20), j3(21)
        // so days will be [20, 21]
        expect(items[0].type).toBe('separator');
        expect(items[0].date).toBe(new Date(2024, 2, 20).getTime());
        expect(items[1].id).toBe('j1');
        expect(items[2].id).toBe('j2');

        expect(items[3].type).toBe('separator');
        expect(items[3].date).toBe(new Date(2024, 2, 21).getTime());
        expect(items[4].id).toBe('j3');
    });

    it('should calculate daily stats correctly for same currency', () => {
        const { result } = renderHook(() => useJournalListViewModel({
            emptyState: { title: 'Empty', subtitle: 'None' },
            baseCurrency: 'USD'
        }));

        const sep20 = result.current.items.find(i => i.id === `sep-${new Date(2024, 2, 20).getTime()}`);

        expect(sep20?.count).toBe(2);
        // Income 100 - Expense 20 = 80
        expect(sep20?.netAmount).toBe(80);
    });

    it('should normalize amounts using exchangeRateMap', () => {
        const { result } = renderHook(() => useJournalListViewModel({
            emptyState: { title: 'Empty', subtitle: 'None' },
            baseCurrency: 'USD',
            exchangeRateMap: { 'EUR': 0.5 } // 1 USD = 0.5 EUR => 50 EUR = 100 USD
        }));

        const sep21 = result.current.items.find(i => i.id === `sep-${new Date(2024, 2, 21).getTime()}`);

        expect(sep21?.count).toBe(1);
        // 50 EUR / 0.5 = 100 USD (Expense)
        expect(sep21?.netAmount).toBe(-100);
    });

    it('should log warning and skip amount when exchange rate is missing', () => {
        const { logger } = require('@/src/utils/logger');

        const { result } = renderHook(() => useJournalListViewModel({
            emptyState: { title: 'Empty', subtitle: 'None' },
            baseCurrency: 'USD',
            exchangeRateMap: {} // Missing EUR
        }));

        const sep21 = result.current.items.find(i => i.id === `sep-${new Date(2024, 2, 21).getTime()}`);

        expect(sep21?.netAmount).toBe(0); // Skipped
        expect(logger.warn).toHaveBeenCalledWith('Missing EUR to USD');
    });

    it('should handle collapsed days', () => {
        const { result } = renderHook(() => useJournalListViewModel({
            emptyState: { title: 'Empty', subtitle: 'None' }
        }));

        // Toggle day (j1, j2 are on day 20, which is first separator index 0)
        act(() => {
            result.current.items[0].onToggle?.();
        });

        const itemsAfter = result.current.items;
        // j1 and j2 should be gone
        expect(itemsAfter.find(i => i.id === 'j1')).toBeUndefined();
        expect(itemsAfter.find(i => i.id === 'j2')).toBeUndefined();
        expect(itemsAfter.length).toBe(3); // 2 seps + j3
    });
});
