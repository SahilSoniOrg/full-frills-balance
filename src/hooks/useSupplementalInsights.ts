import { useMemo, useSyncExternalStore } from 'react';
import { journalBalanceInsightService } from '@/src/services/integrity';
import type { Insight } from '@/src/services/insight/insightTypes';
import { updateInsightService } from '@/src/services/update/updateInsightService';
import type { WorkplaceId } from '@/src/types/ids';

const EMPTY_INSIGHTS: never[] = [];
const subscribeToUpdates = (listener: () => void) => updateInsightService.subscribe(listener);
const subscribeToJournalBalance = (listener: () => void) =>
  journalBalanceInsightService.subscribe(listener);
const subscribeToNothing = () => () => undefined;

export function useSupplementalInsights(
  workplaceId: WorkplaceId,
  dismissed = false,
  enabled = true,
): Insight[] {
  const updates = useSyncExternalStore(
    enabled ? subscribeToUpdates : subscribeToNothing,
    () => (enabled ? updateInsightService.observe(workplaceId, dismissed) : EMPTY_INSIGHTS),
    () => EMPTY_INSIGHTS,
  );
  // Unbalanced-journal notifications cannot be dismissed, so they never appear in that list.
  const journalBalance = useSyncExternalStore(
    enabled ? subscribeToJournalBalance : subscribeToNothing,
    () =>
      enabled && !dismissed ? journalBalanceInsightService.observe(workplaceId) : EMPTY_INSIGHTS,
    () => EMPTY_INSIGHTS,
  );
  return useMemo(() => [...journalBalance, ...updates], [journalBalance, updates]);
}
