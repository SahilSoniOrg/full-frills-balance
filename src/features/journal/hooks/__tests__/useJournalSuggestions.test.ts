import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { journalService } from '@/src/services/journal/journalDomainService';
import { WorkplaceId } from '@/src/types/ids';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/services/journal/journalDomainService');

describe('useJournalSuggestions', () => {
  const workplaceId = 'wp-suggestions-test' as WorkplaceId;
  const mockSuggestions = [
    { description: 'Coffee at Starbucks', count: 12 },
    { description: 'Supermarket Groceries', count: 8 },
    { description: 'Coffee at Blue Bottle', count: 5 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (journalService.getJournalSuggestions as jest.Mock).mockResolvedValue(mockSuggestions);
  });

  it('does not fetch suggestions on mount if searchQuery is empty', async () => {
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, ''));

    expect(result.current.suggestions).toEqual([]);
    expect(journalService.getJournalSuggestions).not.toHaveBeenCalled();
  });

  it('fetches and filters suggestions when searchQuery is non-empty', async () => {
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, 'coff'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId);
    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions[0].description).toBe('Coffee at Starbucks');
    expect(result.current.suggestions[1].description).toBe('Coffee at Blue Bottle');
  });

  it('fetches on-demand when loadSuggestions is invoked', async () => {
    const { result } = renderHook(() => useJournalSuggestions(workplaceId, ''));

    await act(async () => {
      await result.current.loadSuggestions();
    });

    expect(journalService.getJournalSuggestions).toHaveBeenCalledWith(workplaceId);
  });
});
