import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { TabType } from '@/src/types/domainJournal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { journalService } from '@/src/services/journal/journalDomainService';
import { logger } from '@/src/utils/logger';

const SUGGESTION_CATALOG_KEY = '__catalog__';
const SUGGESTION_CATALOG_LIMIT = 50;

export type JournalSuggestionState = 'idle' | 'loading' | 'empty' | 'error' | 'results';

export function resolveJournalSuggestionState(params: {
  query: string;
  isLoading: boolean;
  error: Error | null;
  suggestions: JournalAutofillSuggestion[];
}): JournalSuggestionState {
  if (params.isLoading) return 'loading';
  if (params.error) return 'error';
  if (!params.query.trim()) return params.suggestions.length > 0 ? 'results' : 'idle';
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
  const requestRef = useRef<{
    workplaceId: WorkplaceId;
    queryKey: string;
    promise: Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (activeWorkplaceRef.current === workplaceId) return;

    activeWorkplaceRef.current = workplaceId;
    loadedKeyRef.current = null;
    requestRef.current = null;
    setAllSuggestions([]);
    setIsLoading(false);
    setError(null);
  }, [workplaceId]);

  const fetchSuggestions = useCallback((): Promise<void> => {
    if (!workplaceId) return Promise.resolve();

    if (loadedKeyRef.current === SUGGESTION_CATALOG_KEY) return Promise.resolve();

    const existingRequest = requestRef.current;
    if (
      existingRequest?.workplaceId === workplaceId &&
      existingRequest.queryKey === SUGGESTION_CATALOG_KEY
    ) {
      return existingRequest.promise;
    }

    setIsLoading(true);
    setError(null);
    const request = journalService.getJournalSuggestions(workplaceId, '', SUGGESTION_CATALOG_LIMIT);
    const trackedRequest = request
      .then(suggestions => {
        if (activeWorkplaceRef.current !== workplaceId) return;
        loadedKeyRef.current = SUGGESTION_CATALOG_KEY;
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

    requestRef.current = {
      workplaceId,
      queryKey: SUGGESTION_CATALOG_KEY,
      promise: trackedRequest,
    };
    return trackedRequest;
  }, [workplaceId]);

  // Suggestions are loaded on focus, not on screen mount. The service-level
  // in-flight cache coalesces repeated focus/typing requests.
  const loadSuggestions = fetchSuggestions;

  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const byDescription = new Map<string, JournalAutofillSuggestion>();

    for (const item of allSuggestions) {
      const normalizedDescription = item.description.trim().toLowerCase();
      if (
        query &&
        (!item.description.toLowerCase().includes(query) ||
          item.description.toLowerCase() === query)
      ) {
        continue;
      }
      if (!isTargetAccountCompatible(item.targetAccountType, activeTabType)) continue;

      const targetKey =
        item.targetAccountId ||
        `${item.targetAccountType ?? 'none'}:${item.targetAccountName?.trim().toLowerCase() ?? 'none'}`;
      const suggestionKey = `${normalizedDescription}:${targetKey}`;
      const existing = byDescription.get(suggestionKey);
      if (!existing || isStrongerSuggestion(item, existing)) {
        byDescription.set(suggestionKey, item);
      }
    }

    return [...byDescription.values()].sort((a, b) => b.count - a.count).slice(0, 20);
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

function isStrongerSuggestion(
  candidate: JournalAutofillSuggestion,
  existing: JournalAutofillSuggestion,
): boolean {
  if (candidate.count !== existing.count) return candidate.count > existing.count;
  return (candidate.confidence ?? 0) > (existing.confidence ?? 0);
}
