import { WorkplaceId } from '@/src/types/domain';
import { useEffect, useMemo, useState } from 'react';
import { journalService } from '@/src/services/journal/journalDomainService';

/**
 * Hook to provide journal description suggestions based on past entries.
 * Fetches recent unique descriptions once and filters them based on current input.
 */
export function useJournalSuggestions(workplaceId: WorkplaceId, searchQuery: string) {
  const [allSuggestions, setAllSuggestions] = useState<{ description: string; count: number }[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!workplaceId) return;

    const fetchSuggestions = async () => {
      setIsLoading(true);
      try {
        const suggestions = await journalService.getJournalSuggestions(workplaceId);
        setAllSuggestions(suggestions);
      } catch (error) {
        console.error('Failed to fetch journal suggestions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [workplaceId]);

  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return allSuggestions
      .filter(
        item =>
          item.description.toLowerCase().includes(query) &&
          item.description.toLowerCase() !== query,
      )
      .sort((a, b) => {
        // Sort by frequency (count) descending
        return b.count - a.count;
      })
      .slice(0, 10) // Limit to top 10 matches
      .map(item => item.description);
  }, [allSuggestions, searchQuery]);

  return {
    suggestions: filteredSuggestions,
    isLoading,
  };
}
