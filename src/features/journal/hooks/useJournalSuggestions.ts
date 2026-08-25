import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { TabType } from '@/src/types/domainJournal';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { journalService } from '@/src/services/journal/journalDomainService';
import { logger } from '@/src/utils/logger';

const SUGGESTION_LOAD_DEBOUNCE_MS = 150;

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
  const allSuggestionsRef = useRef<JournalAutofillSuggestion[] | null>(null);
  const activeWorkplaceRef = useRef(workplaceId);
  const requestRef = useRef<{
    workplaceId: WorkplaceId;
    promise: Promise<void>;
  } | null>(null);
  const scheduledLoadRef = useRef<Promise<void> | null>(null);
  const scheduledLoadResolveRef = useRef<(() => void) | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelInteractionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (activeWorkplaceRef.current === workplaceId) return;

    activeWorkplaceRef.current = workplaceId;
    allSuggestionsRef.current = null;
    requestRef.current = null;
    setAllSuggestions([]);
    setIsLoading(false);
  }, [workplaceId]);

  const fetchSuggestions = useCallback((): Promise<void> => {
    if (!workplaceId) return Promise.resolve();

    if (allSuggestionsRef.current) return Promise.resolve();

    const existingRequest = requestRef.current;
    if (existingRequest?.workplaceId === workplaceId) return existingRequest.promise;

    setIsLoading(true);
    const request = journalService.getJournalSuggestions(workplaceId);
    const trackedRequest = request
      .then(suggestions => {
        if (activeWorkplaceRef.current !== workplaceId) return;

        allSuggestionsRef.current = suggestions;
        setAllSuggestions(suggestions);
      })
      .catch(error => {
        if (activeWorkplaceRef.current === workplaceId) {
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

    requestRef.current = { workplaceId, promise: trackedRequest };
    return trackedRequest;
  }, [workplaceId]);

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

  useEffect(() => cancelScheduledLoad, [cancelScheduledLoad, workplaceId]);

  const loadSuggestions = useCallback((): Promise<void> => {
    if (!workplaceId || allSuggestionsRef.current) return Promise.resolve();

    const existingRequest = requestRef.current;
    if (existingRequest?.workplaceId === workplaceId) return existingRequest.promise;
    if (scheduledLoadRef.current) return scheduledLoadRef.current;

    scheduledLoadRef.current = new Promise<void>(resolve => {
      scheduledLoadResolveRef.current = resolve;
      loadTimerRef.current = setTimeout(() => {
        loadTimerRef.current = null;
        cancelInteractionRef.current = runAfterInteractions(() => {
          cancelInteractionRef.current = null;
          void fetchSuggestions().finally(() => {
            scheduledLoadRef.current = null;
            scheduledLoadResolveRef.current = null;
            resolve();
          });
        });
      }, SUGGESTION_LOAD_DEBOUNCE_MS);
    });

    return scheduledLoadRef.current;
  }, [fetchSuggestions, workplaceId]);

  useEffect(() => {
    if (!workplaceId) return;

    // Warm the workplace-scoped cache without delaying entry rendering.
    void loadSuggestions();
  }, [loadSuggestions, workplaceId]);

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

  return {
    suggestions: filteredSuggestions,
    isLoading,
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
