import type { JournalSuggestion, JournalSuggestionPage } from '@/src/types/journalSuggestions';
import { WorkplaceId } from '@/src/types/ids';
import type { TabType } from '@/src/types/domainJournal';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { journalService } from '@/src/services/journal/journalDomainService';
import { logger } from '@/src/utils/logger';

export type JournalSuggestionState = 'idle' | 'loading' | 'empty' | 'error' | 'results';
export type { JournalSuggestionPage };

export function resolveJournalSuggestionState(params: {
  query: string;
  isLoading: boolean;
  error: Error | null;
  suggestions: JournalSuggestion[];
}): JournalSuggestionState {
  if (params.suggestions.length > 0) return 'results';
  if (params.isLoading) return 'loading';
  if (params.error) return 'error';
  if (!params.query.trim()) return 'idle';
  return 'empty';
}

/** Loads route templates for the active page once the description field is engaged. */
export function useJournalSuggestions(
  workplaceId: WorkplaceId,
  searchQuery: string,
  activeTabType?: TabType,
  page: JournalSuggestionPage = 'simple',
) {
  const [enabled, setEnabled] = useState(false);
  const [settledRequest, setSettledRequest] = useState<{
    key: string;
    suggestions: JournalSuggestion[];
    error: Error | null;
  } | null>(null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const requestKey = JSON.stringify([workplaceId, normalizedQuery, page, activeTabType]);

  const loadSuggestions = useCallback(() => setEnabled(true), []);

  useEffect(() => {
    if (!enabled || !workplaceId) return;

    let current = true;
    const timeout = setTimeout(
      () => {
        void journalService
          .getJournalSuggestions({
            workplaceId,
            query: normalizedQuery,
            page,
            transactionType: activeTabType,
            limit: 50,
          })
          .then(results => {
            if (current) setSettledRequest({ key: requestKey, suggestions: results, error: null });
          })
          .catch(reason => {
            if (!current) return;
            const nextError =
              reason instanceof Error ? reason : new Error('Suggestions unavailable');
            setSettledRequest({ key: requestKey, suggestions: [], error: nextError });
            logger.error('Failed to fetch journal suggestions:', reason);
          });
      },
      normalizedQuery ? 160 : 0,
    );

    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [activeTabType, enabled, normalizedQuery, page, requestKey, workplaceId]);

  const isCurrentRequestSettled = settledRequest?.key === requestKey;
  // Keep the last successful list on screen while a new query is in flight.
  const suggestions = settledRequest?.suggestions ?? [];
  const error = isCurrentRequestSettled ? settledRequest.error : null;
  const isLoading = enabled && Boolean(workplaceId) && !isCurrentRequestSettled;

  const rankedSuggestions = useMemo(() => {
    const query = normalizedQuery.toLowerCase();
    return [...suggestions].sort((a, b) => {
      const rank = (description: string) => {
        const normalized = description.trim().toLowerCase();
        if (!query) return 0;
        if (normalized === query) return 0;
        if (normalized.startsWith(query)) return 1;
        if (normalized.split(/\s+/).some(word => word.startsWith(query))) return 2;
        return 3;
      };
      return (
        rank(a.description) - rank(b.description) ||
        b.history.count - a.history.count ||
        b.history.lastUsedAt - a.history.lastUsedAt
      );
    });
  }, [normalizedQuery, suggestions]);

  const suggestionState = resolveJournalSuggestionState({
    query: searchQuery,
    isLoading,
    error,
    suggestions: rankedSuggestions,
  });

  return { suggestions: rankedSuggestions, suggestionState, isLoading, error, loadSuggestions };
}
