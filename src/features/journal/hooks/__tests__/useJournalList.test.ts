import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { renderHook } from '@testing-library/react-native';
import { useJournalList } from '../useJournalList';
import { JournalDisplayType, WorkplaceId, AccountId, JournalId } from '@/src/types/domain';

jest.mock('@/src/features/journal/hooks/useJournals', () => ({
  useJournals: jest.fn(),
}));

const mockSetFilter = jest.fn();
let mockDateRange: { startDate: number; endDate: number } | null = {
  startDate: 1,
  endDate: 2,
};

jest.mock('@/src/hooks/useDateRangeFilter', () => ({
  useDateRangeFilter: () => ({
    get dateRange() {
      return mockDateRange;
    },
    periodFilter: { type: 'MONTH' },
    isPickerVisible: false,
    showPicker: jest.fn(),
    hidePicker: jest.fn(),
    setFilter: mockSetFilter,
    navigatePrevious: jest.fn(),
    navigateNext: jest.fn(),
  }),
}));

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toJournalDetails: jest.fn() },
}));

jest.mock('@/src/contexts/UIContext', () => ({
  useUI: () => ({ defaultCurrency: 'USD', isInitialized: true }),
}));

jest.mock('@/src/hooks/useSharePrefs', () => ({
  useSharePrefs: () => ({ defaultShareFormat: 'text', setDefaultShareFormat: jest.fn() }),
}));

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    activeWorkplaceId: 'wp-1',
    activeWorkplace: { id: 'wp-1', name: 'Personal' },
    defaultCurrencyCode: 'USD',
    workplaceId: 'wp-1',
  }),
}));

jest.mock('@/src/hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({ rateMap: { EUR: 0.5 } }),
}));

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    getRate: jest.fn(() => Promise.resolve(1)),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), metric: jest.fn() },
}));

jest.mock('@/src/constants', () => {
  const actual = jest.requireActual('@/src/constants');
  return {
    ...actual,
    AppConfig: {
      ...actual.AppConfig,
      defaultCurrency: 'USD',
      defaultCurrencyPrecision: 2,
      defaults: {
        ...actual.AppConfig?.defaults,
        journalPageSize: 20,
        plannedJournalLimit: 50,
      },
      strings: {
        ...actual.AppConfig?.strings,
        common: { loading: 'Loading' },
        journal: {
          from: 'From: ',
          to: 'To: ',
          transaction: 'Transaction',
          transfer: 'Transfer',
          transactionCount: (c: number) => `${c} transactions`,
          errors: {
            missingExchangeRate: (f: string, t: string) => `Missing ${f} to ${t}`,
          },
        },
      },
    },
  };
});

jest.mock('@/src/utils/money', () => ({
  safeAdd: (a: number, b: number) => a + b,
  safeSubtract: (a: number, b: number) => a - b,
}));

const mockEnrichedJournals: import('@/src/types/domain').EnrichedJournal[] = [
  {
    id: 'j1' as JournalId,
    journalDate: new Date(2024, 2, 20, 10).getTime(),
    displayType: JournalDisplayType.INCOME,
    totalAmount: 100,
    currencyCode: 'USD',
    description: 'Salary',
    status: 'POSTED',
    transactionCount: 1,
    accounts: [{ id: 'a1' as AccountId, name: 'Bank', role: 'DESTINATION', accountType: 'ASSET' }],
  },
];

describe('useJournalList', () => {
  const useJournalsMock = useJournals as jest.MockedFunction<typeof useJournals>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDateRange = { startDate: 1, endDate: 2 };
    useJournalsMock.mockReturnValue({
      journals: mockEnrichedJournals,
      timelineRows: undefined,
      isLoading: false,
      isLoadingMore: false,
      hasMore: true,
      loadMore: jest.fn(),
      version: 1,
    });
  });

  it('returns render bundles for JournalListView', () => {
    const { result } = renderHook(() =>
      useJournalList(
        { emptyState: { title: 'Empty', subtitle: 'None' } },
        'test-wp' as WorkplaceId,
      ),
    );

    expect(result.current.list).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        isLoading: false,
        emptyTitle: 'Empty',
        emptySubtitle: 'None',
      }),
    );
    expect(result.current.datePicker).toEqual(
      expect.objectContaining({
        visible: false,
        currentFilter: { type: 'MONTH' },
        onSelect: expect.any(Function),
      }),
    );
    expect(result.current.selection).toEqual(
      expect.objectContaining({
        selectedIds: expect.any(Set),
        isSelectionModeActive: false,
        exitSelectionMode: expect.any(Function),
      }),
    );
    expect(result.current.periodBar).toEqual(
      expect.objectContaining({
        range: mockDateRange,
        onPress: expect.any(Function),
      }),
    );
  });

  it('passes date range through to the shared pipeline', () => {
    renderHook(() =>
      useJournalList(
        { emptyState: { title: 'Empty', subtitle: 'None' } },
        'test-wp' as WorkplaceId,
      ),
    );

    const coreCalls = useJournalsMock.mock.calls.filter(
      call => call[1] === 20 && call[4] === undefined,
    );
    const latestCoreCall = coreCalls[coreCalls.length - 1];
    expect(latestCoreCall?.[2]).toEqual(mockDateRange);
  });
});
