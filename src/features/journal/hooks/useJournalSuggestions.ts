import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { TabType } from '@/src/types/domainJournal';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { journalService } from '@/src/services/journal/journalDomainService';
import { logger } from '@/src/utils/logger';

const SUGGESTION_LOAD_DEBOUNCE_MS = 150;

export type JournalSuggestionState = 'idle' | 'loading' | 'empty' | 'error' | 'results';

export function resolveJournalSuggestionState(params: {
  query: string;
  isLoading: boolean;
  error: Error | null;
  suggestions: JournalAutofillSuggestion[];
}): JournalSuggestionState {
  if (!params.query.trim()) return 'idle';
  if (params.isLoading) return 'loading';
  if (params.error) return 'error';
  return params.suggestions.length > 0 ? 'results' : 'empty';
}

/**
 * Hook to provide journal description suggestions based on past entries.
 * Fetches recent unique descriptions in the background after the entry settles,
 * with on-demand loading as a fallback when the field is focused or typed.
 */
export function useJournalSuggestions(
  workplaceId: WorkplaceId,
  searchQuery: string,
  activeTabType?: TabType,
) {
  const [allSuggestions, setAllSuggestions] = useState<JournalAutofillSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const activeWorkplaceRef = useRef(workplaceId);
  const activeQueryRef = useRef(searchQuery.trim().toLowerCase());
  const requestRef = useRef<{
    workplaceId: WorkplaceId;
    queryKey: string;
    promise: Promise<void>;
  } | null>(null);
  const scheduledLoadRef = useRef<Promise<void> | null>(null);
  const scheduledLoadResolveRef = useRef<(() => void) | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelInteractionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    activeQueryRef.current = searchQuery.trim().toLowerCase();
  }, [searchQuery]);

  useEffect(() => {
    if (activeWorkplaceRef.current === workplaceId) return;

    activeWorkplaceRef.current = workplaceId;
    loadedKeyRef.current = null;
    requestRef.current = null;
    setAllSuggestions([]);
    setIsLoading(false);
    setError(null);
  }, [workplaceId]);

  const fetchSuggestions = useCallback(
    (query: string): Promise<void> => {
      if (!workplaceId) return Promise.resolve();

      const queryKey = query.trim().toLowerCase();
      if (loadedKeyRef.current === queryKey) return Promise.resolve();

      const existingRequest = requestRef.current;
      if (existingRequest?.workplaceId === workplaceId && existingRequest.queryKey === queryKey) {
        return existingRequest.promise;
      }

      setIsLoading(true);
      setError(null);
      const request = journalService.getJournalSuggestions(workplaceId, queryKey, 20);
      const trackedRequest = request
        .then(suggestions => {
          if (activeWorkplaceRef.current !== workplaceId || activeQueryRef.current !== queryKey) {
            return;
          }

          loadedKeyRef.current = queryKey;
          setAllSuggestions(suggestions);
        })
        .catch(error => {
          if (activeWorkplaceRef.current === workplaceId) {
            setError(error instanceof Error ? error : new Error('Suggestions unavailable'));
            logger.error('Failed to fetch journal suggestions:', error);
          }
        })
        .finally(() => {
          if (requestRef.current?.promise !== trackedRequest) return;

          requestRef.current = null;
          if (activeWorkplaceRef.current === workplaceId) {
            setIsLoading(false);
          }
        });

      requestRef.current = { workplaceId, queryKey, promise: trackedRequest };
      return trackedRequest;
    },
    [workplaceId],
  );

  const cancelScheduledLoad = useCallback(() => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
    cancelInteractionRef.current?.();
    cancelInteractionRef.current = null;
    scheduledLoadResolveRef.current?.();
    scheduledLoadResolveRef.current = null;
    scheduledLoadRef.current = null;
  }, []);

  useEffect(() => cancelScheduledLoad, [cancelScheduledLoad, searchQuery, workplaceId]);

  const loadSuggestions = useCallback((): Promise<void> => {
    if (!workplaceId) return Promise.resolve();
    const queryKey = searchQuery.trim().toLowerCase();
    if (loadedKeyRef.current === queryKey) return Promise.resolve();

    const existingRequest = requestRef.current;
    if (existingRequest?.workplaceId === workplaceId && existingRequest.queryKey === queryKey) {
      return existingRequest.promise;
    }
    if (scheduledLoadRef.current) return scheduledLoadRef.current;

    scheduledLoadRef.current = new Promise<void>(resolve => {
      scheduledLoadResolveRef.current = resolve;
      loadTimerRef.current = setTimeout(() => {
        loadTimerRef.current = null;
        cancelInteractionRef.current = runAfterInteractions(() => {
          cancelInteractionRef.current = null;
          void fetchSuggestions(queryKey).finally(() => {
            scheduledLoadRef.current = null;
            scheduledLoadResolveRef.current = null;
            resolve();
          });
        });
      }, SUGGESTION_LOAD_DEBOUNCE_MS);
    });

    return scheduledLoadRef.current;
  }, [fetchSuggestions, searchQuery, workplaceId]);

  useEffect(() => {
    if (!workplaceId) return;

    // Warm the workplace-scoped cache without delaying entry rendering.
    void loadSuggestions();
  }, [loadSuggestions, workplaceId]);

  useEffect(() => {
    if (!workplaceId || !searchQuery.trim()) return;
    const queryKey = searchQuery.trim().toLowerCase();
    if (loadedKeyRef.current !== queryKey) {
      setAllSuggestions([]);
      setError(null);
    }
    void loadSuggestions();
  }, [loadSuggestions, searchQuery, workplaceId]);

  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return allSuggestions
      .filter(
        item =>
          item.description.toLowerCase().includes(query) &&
          item.description.toLowerCase() !== query &&
          isTargetAccountCompatible(item.targetAccountType, activeTabType),
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [activeTabType, allSuggestions, searchQuery]);

  const suggestionState = useMemo(
    () =>
      resolveJournalSuggestionState({
        query: searchQuery,
        isLoading,
        error,
        suggestions: filteredSuggestions,
      }),
    [error, filteredSuggestions, isLoading, searchQuery],
  );

  return {
    suggestions: filteredSuggestions,
    suggestionState,
    isLoading,
    error,
    loadSuggestions,
  };
}

function isTargetAccountCompatible(
  targetAccountType: AccountType | undefined,
  activeTabType: TabType | undefined,
): boolean {
  if (!activeTabType || !targetAccountType) return true;
  if (activeTabType === 'expense') return targetAccountType === AccountType.EXPENSE;
  if (activeTabType === 'income') return targetAccountType === AccountType.INCOME;
  return targetAccountType === AccountType.ASSET || targetAccountType === AccountType.LIABILITY;
}
