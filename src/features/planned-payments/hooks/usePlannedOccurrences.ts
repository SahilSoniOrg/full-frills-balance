import { AppConfig } from '@/src/constants';
import type { AccountFields } from '@/src/types/domain';
import { useJournals } from '@/src/features/journal';
import { useObservable } from '@/src/hooks/useObservable';
import { keepProjectablePlannedJournals } from '@/src/services/planned-payment/projectablePlannedJournals';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { Flow } from '@/src/services/simulation/types';
import {
  EnrichedJournal,
  JournalStatus,
  PlainPlannedPayment,
  WorkplaceId,
} from '@/src/types/domain';
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
  accountMap?: Map<string, AccountFields>;
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

  const { data: activePlannedPayments } = useObservable<PlainPlannedPayment[]>(
    () => plannedPaymentReadService.observeActive(workplaceId),
    [workplaceId],
    [],
  );

  const projectablePlannedJournals = useMemo(
    () => keepProjectablePlannedJournals(plannedJournals || [], activePlannedPayments),
    [plannedJournals, activePlannedPayments],
  );

  const items = useMemo(() => {
    if (!allFlows?.length) {
      return mergePlannedOccurrences(projectablePlannedJournals, []);
    }

    const simulated = mapLiabilityFlowsToPlannedOccurrences({
      allFlows,
      accountMap: accountMap ?? new Map(),
      currencyCode: currencyCode || 'INR',
    });

    return mergePlannedOccurrences(projectablePlannedJournals, simulated);
  }, [projectablePlannedJournals, allFlows, accountMap, currencyCode]);

  const { onPlannedJournalPress } = usePlannedOccurrenceActions(workplaceId);

  return {
    items,
    onItemPress: onPlannedJournalPress,
  };
}
