import {
  resolveJournalSuggestionState,
  useJournalSuggestions,
} from '@/src/features/journal/hooks/useJournalSuggestions';
import { journalService } from '@/src/services/journal/journalDomainService';
import { AccountType } from '@/src/types/enums';
import type { JournalSuggestion } from '@/src/types/journalSuggestions';
import { WorkplaceId } from '@/src/types/ids';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/services/journal/journalDomainService');

const workplaceId = 'wp-suggestions-test' as WorkplaceId;
const suggestion: JournalSuggestion = {
  key: 'grocery-route',
  description: 'Grocery purchase',
  route: {
    sources: [{ id: 'bank' as any, name: 'Bank', type: AccountType.ASSET }],
    destinations: [{ id: 'groceries' as any, name: 'Groceries', type: AccountType.EXPENSE }],
  },
  history: { count: 2, lastUsedAt: 10 },
};

describe('useJournalSuggestions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (journalService.getJournalSuggestions as jest.Mock).mockResolvedValue([suggestion]);
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['idle', { query: '', isLoading: false, error: null, suggestions: [] }],
    ['loading', { query: 'gro', isLoading: true, error: null, suggestions: [] }],
    ['error', { query: 'gro', isLoading: false, error: new Error('down'), suggestions: [] }],
    ['empty', { query: 'gro', isLoading: false, error: null, suggestions: [] }],
    ['results', { query: 'gro', isLoading: false, error: null, suggestions: [suggestion] }],
  ])('classifies %s suggestion state', (expected, params) => {
    expect(resolveJournalSuggestionState(params as any)).toBe(expected);
  });

  it('loads only after focus and passes the active search and page to the repository', async () => {
    const { result } = renderHook(() =>
      useJournalSuggestions(workplaceId, ' grocery ', 'expense', 'split'),
    );

    expect(journalService.getJournalSuggestions).not.toHaveBeenCalled();
    act(() => result.current.loadSuggestions());
    await act(async () => {
      jest.advanceTimersByTime(160);
      await Promise.resolve();
    });

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith({
      workplaceId,
      query: 'grocery',
      page: 'split',
      transactionType: 'expense',
      limit: 50,
    });
    expect(result.current.suggestions).toEqual([suggestion]);
  });

  it('reloads when the selected page changes, preserving mode-specific routing', async () => {
    const { result, rerender } = renderHook(
      ({ page }: { page: 'split' | 'advanced' }) =>
        useJournalSuggestions(workplaceId, '', undefined, page),
      { initialProps: { page: 'split' as const } },
    );

    act(() => result.current.loadSuggestions());
    await act(async () => {
      jest.advanceTimersByTime(160);
      await Promise.resolve();
    });
    rerender({ page: 'advanced' });
    await act(async () => {
      jest.advanceTimersByTime(160);
      await Promise.resolve();
    });

    expect(journalService.getJournalSuggestions).toHaveBeenNthCalledWith(1, {
      workplaceId,
      query: '',
      page: 'split',
      transactionType: undefined,
      limit: 50,
    });
    expect(journalService.getJournalSuggestions).toHaveBeenNthCalledWith(2, {
      workplaceId,
      query: '',
      page: 'advanced',
      transactionType: undefined,
      limit: 50,
    });
  });
});
