import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { WorkplaceId } from '@/src/types/domain';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { journalService } from '@/src/services/journal/journalDomainService';

/**
 * Hook to provide journal description suggestions based on past entries.
 * Fetches recent unique descriptions lazily on-demand (when focused or typed)
 * and filters them based on current input.
 */
export function useJournalSuggestions(workplaceId: WorkplaceId, searchQuery: string) {
  const [allSuggestions, setAllSuggestions] = useState<JournalAutofillSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    if (!workplaceId) return;
    setIsLoading(true);
    try {
      const suggestions = await journalService.getJournalSuggestions(workplaceId);
      setAllSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to fetch journal suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [workplaceId]);

  useEffect(() => {
    if (!workplaceId || searchQuery.trim().length === 0) return;

    let isActive = true;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const suggestions = await journalService.getJournalSuggestions(workplaceId);
        if (!isActive) return;
        setAllSuggestions(suggestions);
      } catch (error) {
        if (isActive) {
          console.error('Failed to fetch journal suggestions:', error);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    const cancel = runAfterInteractions(() => {
      void loadData();
    });

    return () => {
      isActive = false;
      cancel();
    };
  }, [workplaceId, searchQuery]);

  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return allSuggestions
      .filter(
        item =>
          item.description.toLowerCase().includes(query) &&
          item.description.toLowerCase() !== query,
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [allSuggestions, searchQuery]);

  return {
    suggestions: filteredSuggestions,
    isLoading,
    loadSuggestions: fetchSuggestions,
  };
}
