import { useObservable } from '@/src/hooks/useObservable';
import { insightService } from '@/src/services/insight/InsightService';
import type { Insight } from '@/src/services/insight/insightTypes';
import { WorkplaceId } from '@/src/types/ids';
import { EMPTY } from 'rxjs';

/**
 * Active insight patterns for a workplace.
 * Pass `enabled: false` to pause the subscription (e.g. before app ready).
 *
 * Initial `data` is `[]` with `isLoading: true` until the first emission —
 * callers must gate empty UI on `isLoading` to avoid a premature empty flash.
 */
export function useInsightPatterns(workplaceId: WorkplaceId, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  return useObservable<Insight[]>(
    () => (enabled ? insightService.observePatterns(workplaceId) : EMPTY),
    [workplaceId, enabled],
    [],
  );
}

/**
 * Dismissed insight patterns for a workplace.
 * Same loading contract as {@link useInsightPatterns}: gate empty UI on `isLoading`.
 */
export function useDismissedInsightPatterns(workplaceId: WorkplaceId) {
  return useObservable<Insight[]>(
    () => insightService.observeDismissedPatterns(workplaceId),
    [workplaceId],
    [],
  );
}
