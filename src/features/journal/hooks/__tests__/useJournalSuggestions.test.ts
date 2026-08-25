import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
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

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId);
  });

  it('fetches and filters suggestions when searchQuery is non-empty', async () => {
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, 'coff'));
    let loadPromise: Promise<void>;

    act(() => {
      loadPromise = result.current.loadSuggestions();
      jest.advanceTimersByTime(150);
    });
    await act(async () => loadPromise);

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId);
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

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId);
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
