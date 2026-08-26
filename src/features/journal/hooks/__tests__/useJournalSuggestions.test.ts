import {
  resolveJournalSuggestionState,
  useJournalSuggestions,
} from '@/src/features/journal/hooks/useJournalSuggestions';
import { journalService } from '@/src/services/journal/journalDomainService';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/services/journal/journalDomainService');
jest.mock('@/src/utils/scheduler', () => ({
  runAfterInteractions: (task: () => void) => {
    task();
    return jest.fn();
  },
}));

describe('useJournalSuggestions', () => {
  const workplaceId = 'wp-suggestions-test' as WorkplaceId;
  const mockSuggestions = [
    { description: 'Coffee at Starbucks', count: 12 },
    { description: 'Supermarket Groceries', count: 8 },
    { description: 'Coffee at Blue Bottle', count: 5 },
  ];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (journalService.getJournalSuggestions as jest.Mock).mockResolvedValue(mockSuggestions);
  });

  it.each([
    ['idle', { query: '', isLoading: false, error: null, suggestions: [] }],
    ['loading', { query: 'cof', isLoading: true, error: null, suggestions: [] }],
    ['error', { query: 'cof', isLoading: false, error: new Error('down'), suggestions: [] }],
    ['empty', { query: 'cof', isLoading: false, error: null, suggestions: [] }],
    ['results', { query: 'cof', isLoading: false, error: null, suggestions: mockSuggestions }],
  ])('classifies %s suggestion state', (expected, params) => {
    expect(resolveJournalSuggestionState(params)).toBe(expected);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prefetches suggestions after the entry settles without blocking mount', async () => {
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, ''));

    expect(result.current.suggestions).toEqual([]);
    expect(journalService.getJournalSuggestions).not.toHaveBeenCalled();

    let loadPromise: Promise<void>;
    act(() => {
      jest.advanceTimersByTime(150);
      loadPromise = result.current.loadSuggestions();
    });
    await act(async () => loadPromise);

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId, '', 50);
    expect(result.current.suggestions).toEqual(mockSuggestions);
  });

  it('fetches and filters suggestions when searchQuery is non-empty', async () => {
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, 'coff'));
    let loadPromise: Promise<void>;

    act(() => {
      loadPromise = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });
    await act(async () => loadPromise);

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId, '', 50);
    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions[0].description).toBe('Coffee at Starbucks');
    expect(result.current.suggestions[1].description).toBe('Coffee at Blue Bottle');
  });

  it('fetches on-demand when loadSuggestions is invoked', async () => {
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, ''));
    let loadPromise: Promise<void>;

    act(() => {
      loadPromise = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });
    await act(async () => loadPromise);

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId, '', 50);
  });

  it('coalesces repeated focus and typing loads, then reuses the cached result', async () => {
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, 'coff'));
    let firstLoad: Promise<void>;
    let secondLoad: Promise<void>;

    act(() => {
      firstLoad = result.current.loadSuggestions();
      secondLoad = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });
    await act(async () => {
      await Promise.all([firstLoad, secondLoad]);
    });

    expect(journalService.getJournalSuggestions).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.loadSuggestions();
    });

    expect(journalService.getJournalSuggestions).toHaveBeenCalledTimes(1);
  });

  it('filters the loaded catalog locally as the query changes', async () => {
    const catalog = deferred<typeof mockSuggestions>();
    (journalService.getJournalSuggestions as jest.Mock).mockReturnValue(catalog.promise);

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useJournalSuggestions(workplaceId, query),
      { initialProps: { query: '' } },
    );

    let firstLoad!: Promise<void>;
    act(() => {
      firstLoad = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });

    await act(async () => {
      catalog.resolve([
        { description: 'Coffee result', count: 2 },
        { description: 'Tea', count: 1 },
      ]);
      await firstLoad;
    });
    rerender({ query: 'coffee' });
    expect(journalService.getJournalSuggestions).toHaveBeenCalledTimes(1);
    expect(result.current.suggestions).toEqual([
      expect.objectContaining({ description: 'Coffee result' }),
    ]);
  });

  it('lets the initial catalog load finish while a later query is active', async () => {
    const initial = deferred<typeof mockSuggestions>();
    (journalService.getJournalSuggestions as jest.Mock).mockReturnValue(initial.promise);

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useJournalSuggestions(workplaceId, query),
      { initialProps: { query: '' } },
    );

    let initialLoad!: Promise<void>;
    act(() => {
      initialLoad = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });

    rerender({ query: 'coffee' });

    await act(async () => {
      initial.resolve([{ description: 'Coffee typed', count: 2 }]);
      await initialLoad;
    });

    expect(journalService.getJournalSuggestions).toHaveBeenCalledTimes(1);
    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId, '', 50);
    expect(result.current.suggestions).toEqual([
      expect.objectContaining({ description: 'Coffee typed' }),
    ]);
  });

  it('keeps rendering bounded when a legacy service returns an oversized result', async () => {
    (journalService.getJournalSuggestions as jest.Mock).mockResolvedValue(
      Array.from({ length: 10_000 }, (_, index) => ({
        description: `Coffee ${index}`,
        count: 10_000 - index,
      })),
    );
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, 'coffee'));

    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });
    await act(async () => loadPromise);

    expect(result.current.suggestions).toHaveLength(20);
    expect(result.current.suggestions[0].description).toBe('Coffee 0');
  });

  it('only shows suggestions compatible with the active tab', async () => {
    (journalService.getJournalSuggestions as jest.Mock).mockResolvedValue([
      {
        description: 'Milk',
        count: 5,
        targetAccountId: 'food',
        targetAccountName: 'Food',
        targetAccountType: AccountType.EXPENSE,
      },
      {
        description: 'Milk',
        count: 2,
        targetAccountId: 'salary',
        targetAccountName: 'Salary',
        targetAccountType: AccountType.INCOME,
      },
    ]);

    const { result } = renderHook(() => useJournalSuggestions(workplaceId, 'mil', 'income'));

    let loadPromise: Promise<void>;
    act(() => {
      loadPromise = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });
    await act(async () => loadPromise);

    expect(result.current.suggestions).toEqual([
      expect.objectContaining({
        description: 'Milk',
        targetAccountName: 'Salary',
        targetAccountType: AccountType.INCOME,
      }),
    ]);
  });

  it('deduplicates descriptions returned for multiple historical accounts', async () => {
    (journalService.getJournalSuggestions as jest.Mock).mockResolvedValue([
      {
        description: 'Chicken breast',
        count: 3,
        confidence: 0.33,
        targetAccountName: 'Other Food',
      },
      {
        description: 'Chicken breast',
        count: 3,
        confidence: 1,
        targetAccountName: 'Food & Drinks',
      },
      { description: 'chicken dinner', count: 1 },
    ]);

    const { result } = renderHook(() => useJournalSuggestions(workplaceId, 'chicken'));

    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });
    await act(async () => loadPromise);

    expect(result.current.suggestions).toHaveLength(3);
    expect(result.current.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Chicken breast',
          targetAccountName: 'Food & Drinks',
        }),
      ]),
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}
