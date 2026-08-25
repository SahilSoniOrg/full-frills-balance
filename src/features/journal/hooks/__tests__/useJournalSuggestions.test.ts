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

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId, '', 20);
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

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId, 'coff', 20);
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

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId, '', 20);
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

  it('keeps a late response for the previous query from replacing current suggestions', async () => {
    const first = deferred<typeof mockSuggestions>();
    const second = deferred<typeof mockSuggestions>();
    (journalService.getJournalSuggestions as jest.Mock)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useJournalSuggestions(workplaceId, query),
      { initialProps: { query: '' } },
    );

    let firstLoad!: Promise<void>;
    act(() => {
      firstLoad = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });

    rerender({ query: 'coffee' });
    let secondLoad!: Promise<void>;
    act(() => {
      secondLoad = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });

    await act(async () => {
      first.resolve([{ description: 'Coffee from old query', count: 1 }]);
      await firstLoad;
    });
    expect(result.current.suggestions).toEqual([]);

    await act(async () => {
      second.resolve([{ description: 'Coffee result', count: 2 }]);
      await secondLoad;
    });
    expect(result.current.suggestions).toEqual([
      expect.objectContaining({ description: 'Coffee result' }),
    ]);
  });

  it('lets the initial background query finish while a later query is active', async () => {
    const initial = deferred<typeof mockSuggestions>();
    const typed = deferred<typeof mockSuggestions>();
    (journalService.getJournalSuggestions as jest.Mock)
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(typed.promise);

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
    let typedLoad!: Promise<void>;
    act(() => {
      typedLoad = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });

    await act(async () => {
      initial.resolve([{ description: 'Coffee initial', count: 1 }]);
      await initialLoad;
    });
    await act(async () => {
      typed.resolve([{ description: 'Coffee typed', count: 2 }]);
      await typedLoad;
    });

    expect(journalService.getJournalSuggestions).toHaveBeenNthCalledWith(1, workplaceId, '', 20);
    expect(journalService.getJournalSuggestions).toHaveBeenNthCalledWith(
      2,
      workplaceId,
      'coffee',
      20,
    );
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

  it('keeps only target categories compatible with the active tab', async () => {
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
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}
