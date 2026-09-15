import { useSyncExternalStore } from 'react';
import { updateInsightService } from '@/src/services/update/updateInsightService';
import type { WorkplaceId } from '@/src/types/ids';

const EMPTY_INSIGHTS: never[] = [];
const subscribeToUpdates = (listener: () => void) => updateInsightService.subscribe(listener);

export function useSupplementalInsights(workplaceId: WorkplaceId, dismissed = false) {
  return useSyncExternalStore(
    subscribeToUpdates,
    () => updateInsightService.observe(workplaceId, dismissed),
    () => EMPTY_INSIGHTS,
  );
}
