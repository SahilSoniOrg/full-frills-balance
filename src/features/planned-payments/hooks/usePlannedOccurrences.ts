import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { JournalStatus } from '@/src/data/models/Journal';
import { useJournals } from '@/src/features/journal';
import { Flow } from '@/src/services/simulation/types';
import { EnrichedJournal, WorkplaceId } from '@/src/types/domain';
import { useMemo } from 'react';
import {
  mapLiabilityFlowsToPlannedOccurrences,
  mergePlannedOccurrences,
} from '../mappers/plannedOccurrenceMapper';
import type { PlannedOccurrenceViewModel } from '../types/PlannedOccurrenceViewModel';
import { usePlannedOccurrenceActions } from './usePlannedOccurrenceActions';

const PLANNED_STATUS = [JournalStatus.PLANNED];

export interface UsePlannedOccurrencesParams {
  workplaceId: WorkplaceId;
  /** STS liability flows to merge as simulated occurrences. */
  allFlows?: Flow[];
  accountMap?: Map<string, Account>;
  currencyCode?: string;
  /** When provided, skips the planned-journal fetch and uses these instead. */
  plannedJournals?: EnrichedJournal[];
}

export interface PlannedOccurrencesResult {
  items: PlannedOccurrenceViewModel[];
  onItemPress: (item: PlannedOccurrenceViewModel) => void;
}

/**
 * Assembles planned-occurrence view models for dashboard (and similar) surfaces:
 * real planned journals + STS-simulated liability outflows.
 */
export function usePlannedOccurrences({
  workplaceId,
  allFlows,
  accountMap,
  currencyCode,
  plannedJournals: plannedJournalsOverride,
}: UsePlannedOccurrencesParams): PlannedOccurrencesResult {
  const { journals: fetchedPlannedJournals } = useJournals(
    workplaceId,
    AppConfig.defaults.plannedJournalLimit,
    undefined,
    undefined,
    PLANNED_STATUS,
  );

  const plannedJournals = plannedJournalsOverride ?? fetchedPlannedJournals;

  const items = useMemo(() => {
    const planned = plannedJournals || [];
    if (!allFlows?.length) {
      return mergePlannedOccurrences(planned, []);
    }

    const simulated = mapLiabilityFlowsToPlannedOccurrences({
      allFlows,
      accountMap: accountMap ?? new Map(),
      currencyCode: currencyCode || 'INR',
    });

    return mergePlannedOccurrences(planned, simulated);
  }, [plannedJournals, allFlows, accountMap, currencyCode]);

  const { onPlannedJournalPress } = usePlannedOccurrenceActions(workplaceId);

  return {
    items,
    onItemPress: onPlannedJournalPress,
  };
}
