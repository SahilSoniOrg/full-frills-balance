import { useSyncExternalStore } from 'react';
import {
  observeSupplementalInsights,
  subscribeToSupplementalInsights,
} from '@/src/services/insight/supplementalInsightStore';
import type { WorkplaceId } from '@/src/types/ids';

const EMPTY_INSIGHTS: never[] = [];

export function useSupplementalInsights(workplaceId: WorkplaceId, dismissed = false) {
  return useSyncExternalStore(
    subscribeToSupplementalInsights,
    () => observeSupplementalInsights(workplaceId, dismissed),
    () => EMPTY_INSIGHTS,
  );
}
