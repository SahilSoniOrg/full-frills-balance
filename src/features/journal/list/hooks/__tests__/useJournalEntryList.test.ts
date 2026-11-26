import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { logger } from '@/src/services/observability/logger';
import { act, renderHook } from '@testing-library/react-native';
import { JournalDisplayType } from '@/src/types/enums';
import { WorkplaceId, AccountId, JournalId } from '@/src/types/ids';
import { toShareableJournalEntry, useJournalEntryList } from '../useJournalEntryList';

jest.mock('@/src/hooks/useShareable', () => ({
  useShareable: () => ({
    share: jest.fn(),
    save: jest.fn(),
    isBusy: false,
    isPending: false,
    progress: null,
    error: null,
  }),
}));

jest.mock('@/src/features/journal/hooks/useJournals', () => ({
  useJournals: jest.fn(),
}));

jest.mock('@/src/navigation/AppNavigation', () => ({
  AppNavigation: { toJournalDetails: jest.fn() },
}));

jest.mock('@/src/contexts/app-shell/appReady', () => ({
  useAppReady: () => ({ isInitialized: true }),
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

jest.mock('@/src/services/observability/logger', () => ({
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
          ...actual.AppConfig.strings.journal,
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

jest.mock('@/src/domain/money/money', () => ({
  ...jest.requireActual('@/src/domain/money/money'),
  safeAdd: (a: number, b: number) => a + b,
  safeSubtract: (a: number, b: number) => a - b,
}));

const mockEnrichedJournals: import('@/src/types/domainReadModels').EnrichedJournal[] = [
  {
    id: 'j1' as JournalId,
    journalDate: new Date(2024, 2, 20, 15).getTime(),
    displayType: JournalDisplayType.INCOME,
    totalAmount: 100,
    currencyCode: 'USD',
    description: 'Salary',
    status: 'POSTED',
    transactionCount: 1,
    accounts: [
      { id: 'a1' as AccountId, name: 'Bank', role: 'DESTINATION', accountType: 'ASSET' },
      { id: 'a4' as AccountId, name: 'Salary', role: 'SOURCE', accountType: 'INCOME' },
    ],
  },
  {
    id: 'j2' as JournalId,
    journalDate: new Date(2024, 2, 20, 10).getTime(),
    displayType: JournalDisplayType.EXPENSE,
    totalAmount: 20,
    currencyCode: 'USD',
    description: 'Coffee',
    status: 'POSTED',
    transactionCount: 1,
    accounts: [
      { id: 'a2' as AccountId, name: 'Cash', role: 'SOURCE', accountType: 'ASSET' },
      { id: 'a5' as AccountId, name: 'Coffee', role: 'DESTINATION', accountType: 'EXPENSE' },
    ],
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
    accounts: [
      { id: 'a3' as AccountId, name: 'Card', role: 'SOURCE', accountType: 'ASSET' },
      { id: 'a6' as AccountId, name: 'Lunch', role: 'DESTINATION', accountType: 'EXPENSE' },
    ],
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
      timelineRows: mockEnrichedJournals.map(j => ({
        journal: j,
        listId: j.id,
        selectionId: j.id,
      })),
      isLoading: false,
      isLoadingMore: false,
      error: null,
      retry: jest.fn(),
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

  it('keeps collapsed days out of the selectable count and Select All', () => {
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

    act(() => result.current.onLongPressItem?.('j1' as JournalId));
    expect(result.current.selectionChrome?.state).toMatchObject({
      selectedCount: 1,
      selectableCount: 2,
    });

    act(() => result.current.selectionChrome?.selectAll());
    expect(result.current.selectedIds).toEqual(new Set(['j1', 'j2']));
  });

  it('should prune stale selection ids when journals change', () => {
    const { result, rerender } = renderHook(() =>
      useJournalEntryList({
        workplaceId: 'test-wp' as WorkplaceId,
      }),
    );

    act(() => {
      result.current.onLongPressItem?.('j1' as JournalId);
      result.current.toggleSelection('j3' as JournalId);
    });

    expect(result.current.selectedIds.has('j1' as JournalId)).toBe(true);
    expect(result.current.selectedIds.has('j3' as JournalId)).toBe(true);

    useJournalsMock.mockReturnValue({
      journals: mockEnrichedJournals.filter(j => j.id !== 'j3'),
      timelineRows: mockEnrichedJournals
        .filter(j => j.id !== 'j3')
        .map(j => ({
          journal: j,
          listId: j.id,
          selectionId: j.id,
        })),
      isLoading: false,
      isLoadingMore: false,
      error: null,
      retry: jest.fn(),
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

describe('selected journal share entries', () => {
  const shopping = {
    id: 'a5' as AccountId,
    name: 'Shopping',
    accountType: 'EXPENSE',
    role: 'SOURCE' as const,
    amount: 100,
  };
  const bank = {
    id: 'a1' as AccountId,
    name: 'Bank',
    accountType: 'ASSET',
    role: 'DESTINATION' as const,
    amount: 100,
  };
  const refund: import('@/src/types/domainReadModels').EnrichedJournal = {
    id: 'refund' as JournalId,
    journalDate: Date.now(),
    description: 'Shopping refund',
    currencyCode: 'INR',
    status: 'POSTED',
    totalAmount: 100,
    transactionCount: 1,
    displayType: JournalDisplayType.EXPENSE,
    accounts: [shopping, bank],
  };
  const purchase: import('@/src/types/domainReadModels').EnrichedJournal = {
    ...refund,
    id: 'purchase' as JournalId,
    description: 'Shopping trip',
    accounts: [
      { ...bank, role: 'SOURCE' as const },
      { ...shopping, role: 'DESTINATION' as const },
    ],
  };

  it('types a refund as income from an expense account listing', () => {
    const entry = toShareableJournalEntry(refund, { accountId: 'a5' as AccountId });
    expect(entry.displayType).toBe(JournalDisplayType.INCOME);
    expect(entry.amount).toBe(100);
  });

  it('types a refund as income from the whole journal too', () => {
    expect(toShareableJournalEntry(refund).displayType).toBe(JournalDisplayType.INCOME);
  });

  it('keeps a purchase as expense from the same expense account', () => {
    expect(toShareableJournalEntry(purchase, { accountId: 'a5' as AccountId }).displayType).toBe(
      JournalDisplayType.EXPENSE,
    );
  });

  it('keeps a transfer unsigned instead of filing it as income or expense', () => {
    const transfer = {
      ...purchase,
      displayType: JournalDisplayType.TRANSFER,
      accounts: [
        { ...bank, role: 'SOURCE' as const },
        { ...bank, id: 'a7' as AccountId, role: 'DESTINATION' as const },
      ],
    };
    expect(toShareableJournalEntry(transfer).displayType).toBe(JournalDisplayType.TRANSFER);
  });

  it('shares the viewed leg amount and currency, not the journal total', () => {
    const multiCurrency = {
      ...purchase,
      totalAmount: 800,
      currencyCode: 'INR',
      accounts: [{ ...bank, amount: 10, currencyCode: 'USD' }, shopping],
    };
    const entry = toShareableJournalEntry(multiCurrency, { accountId: 'a1' as AccountId });
    expect(entry.amount).toBe(10);
    expect(entry.currencyCode).toBe('USD');
  });
});
