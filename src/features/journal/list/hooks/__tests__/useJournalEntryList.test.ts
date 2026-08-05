import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { logger } from '@/src/utils/logger';
import { act, renderHook } from '@testing-library/react-native';
import { JournalDisplayType, WorkplaceId, AccountId, JournalId } from '@/src/types/domain';
import { useJournalEntryList } from '../useJournalEntryList';

jest.mock('@/src/features/journal/hooks/useJournals', () => ({
  useJournals: jest.fn(),
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

let mockRateMap: Record<string, number> = { EUR: 0.5 };
jest.mock('@/src/hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({
    get rateMap() {
      return mockRateMap;
    },
  }),
}));

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: {
    getRate: jest.fn(() => Promise.resolve(1)),
  },
}));

jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), metric: jest.fn() },
}));

jest.mock('@/src/constants', () => ({
  AppConfig: {
    defaultCurrency: 'USD',
    defaultCurrencyPrecision: 2,
    defaults: {
      journalPageSize: 20,
      plannedJournalLimit: 50,
    },
    strings: {
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
}));

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
  {
    id: 'j2' as JournalId,
    journalDate: new Date(2024, 2, 20, 15).getTime(),
    displayType: JournalDisplayType.EXPENSE,
    totalAmount: 20,
    currencyCode: 'USD',
    description: 'Coffee',
    status: 'POSTED',
    transactionCount: 1,
    accounts: [{ id: 'a2' as AccountId, name: 'Cash', role: 'SOURCE', accountType: 'ASSET' }],
  },
  {
    id: 'j3' as JournalId,
    journalDate: new Date(2024, 2, 21, 9).getTime(),
    displayType: JournalDisplayType.EXPENSE,
    totalAmount: 50,
    currencyCode: 'EUR',
    description: 'Lunch',
    status: 'POSTED',
    transactionCount: 1,
    accounts: [{ id: 'a3' as AccountId, name: 'Card', role: 'SOURCE', accountType: 'ASSET' }],
  },
];

describe('useJournalEntryList', () => {
  const useJournalsMock = useJournals as jest.MockedFunction<typeof useJournals>;
  const loadMore = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRateMap = { EUR: 0.5 };
    useJournalsMock.mockReturnValue({
      journals: mockEnrichedJournals,
      isLoading: false,
      isLoadingMore: false,
      hasMore: true,
      loadMore,
      version: 1,
    });
  });

  it('should group journals by date and inject separators', () => {
    const { result } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
      }),
    );

    const items = result.current.items;

    expect(items[0].type).toBe('separator');
    expect(items[0].date).toBe(new Date(2024, 2, 21).getTime());
    expect(items[1].id).toBe('j3');

    expect(items[2].type).toBe('separator');
    expect(items[2].date).toBe(new Date(2024, 2, 20).getTime());
    expect(items[3].id).toBe('j1');
    expect(items[4].id).toBe('j2');
  });

  it('should calculate daily stats correctly for same currency', () => {
    const { result } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
      }),
    );

    const sep20 = result.current.items.find(i => i.id === `sep-${new Date(2024, 2, 20).getTime()}`);

    expect(sep20?.count).toBe(2);
    expect(sep20?.netAmount).toBe(80);
  });

  it('should normalize amounts using exchangeRateMap', () => {
    const { result } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
      }),
    );

    const sep21 = result.current.items.find(i => i.id === `sep-${new Date(2024, 2, 21).getTime()}`);

    expect(sep21?.count).toBe(1);
    expect(sep21?.netAmount).toBe(-100);
  });

  it('should log warning and skip amount when exchange rate is missing', () => {
    mockRateMap = {};

    const { result } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
      }),
    );

    const sep21 = result.current.items.find(i => i.id === `sep-${new Date(2024, 2, 21).getTime()}`);

    expect(sep21?.netAmount).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith('Missing EUR to USD');
  });

  it('should handle collapsed days', () => {
    const { result } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
      }),
    );

    act(() => {
      result.current.items[0].onToggle?.();
    });

    const itemsAfter = result.current.items;
    expect(itemsAfter.find(i => i.id === 'j3')).toBeUndefined();
    expect(itemsAfter.find(i => i.id === 'j1')).toBeDefined();
    expect(itemsAfter.find(i => i.id === 'j2')).toBeDefined();
    expect(itemsAfter.length).toBe(4);
  });

  it('should prune stale selection ids when journals change', () => {
    const { result, rerender } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
      }),
    );

    act(() => {
      result.current.onLongPressItem('j1' as JournalId);
      result.current.toggleSelection('j3' as JournalId);
    });

    expect(result.current.selectedIds.has('j1' as JournalId)).toBe(true);
    expect(result.current.selectedIds.has('j3' as JournalId)).toBe(true);

    useJournalsMock.mockReturnValue({
      journals: mockEnrichedJournals.filter(j => j.id !== 'j3'),
      isLoading: false,
      isLoadingMore: false,
      hasMore: true,
      loadMore,
      version: 2,
    });

    rerender({});

    expect(result.current.selectedIds.has('j1' as JournalId)).toBe(true);
    expect(result.current.selectedIds.has('j3' as JournalId)).toBe(false);
  });

  it('default pagination disables onEndReached while searching', () => {
    const { result } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
        searchQuery: 'coffee',
        paginationPolicy: 'default',
      }),
    );

    expect(result.current.onEndReached).toBeUndefined();
  });

  it('always pagination keeps onEndReached while searching', () => {
    const { result } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
        searchQuery: 'coffee',
        paginationPolicy: 'always',
      }),
    );

    expect(result.current.onEndReached).toBeDefined();
    act(() => {
      result.current.onEndReached?.();
    });
    expect(loadMore).toHaveBeenCalled();
  });

  it('passes journalIds filter through to useJournals', () => {
    renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
        queryOptions: { journalIds: ['j1' as JournalId, 'j2' as JournalId] },
      }),
    );

    expect(useJournalsMock).toHaveBeenCalledWith(
      'test-wp',
      expect.any(Number),
      undefined,
      '',
      undefined,
      undefined,
      expect.objectContaining({
        journalIds: ['j1', 'j2'],
      }),
    );
  });
});
