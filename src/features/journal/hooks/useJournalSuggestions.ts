import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { TabType } from '@/src/types/domainJournal';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { journalService } from '@/src/services/journal/journalDomainService';
import { logger } from '@/src/utils/logger';

/**
 * Hook to provide journal description suggestions based on past entries.
 * Fetches recent unique descriptions lazily on-demand (when focused or typed)
 * and filters them based on current input.
 */
export function useJournalSuggestions(
  workplaceId: WorkplaceId,
  searchQuery: string,
  activeTabType?: TabType,
) {
  const [allSuggestions, setAllSuggestions] = useState<JournalAutofillSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    if (!workplaceId) return;
    setIsLoading(true);
    try {
      const suggestions = await journalService.getJournalSuggestions(workplaceId);
      setAllSuggestions(suggestions);
    } catch (error) {
      logger.error('Failed to fetch journal suggestions:', error);
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
          logger.error('Failed to fetch journal suggestions:', error);
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
          item.description.toLowerCase() !== query &&
          isTargetAccountCompatible(item.targetAccountType, activeTabType),
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [activeTabType, allSuggestions, searchQuery]);

  return {
    suggestions: filteredSuggestions,
    isLoading,
    loadSuggestions: fetchSuggestions,
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
