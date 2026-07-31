import { useObservable } from '@/src/hooks/useObservable';
import { Insight, insightService } from '@/src/services/insight/InsightService';
import { WorkplaceId } from '@/src/types/domain';
import { EMPTY } from 'rxjs';

/**
 * Active insight patterns for a workplace.
 * Pass `enabled: false` to pause the subscription (e.g. before app ready).
 */
export function useInsightPatterns(workplaceId: WorkplaceId, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  return useObservable<Insight[]>(
    () => (enabled ? insightService.observePatterns(workplaceId) : EMPTY),
    [workplaceId, enabled],
    [],
  );
}

/** Dismissed insight patterns for a workplace. */
export function useDismissedInsightPatterns(workplaceId: WorkplaceId) {
  return useObservable<Insight[]>(
    () => insightService.observeDismissedPatterns(workplaceId),
    [workplaceId],
    [],
  );
}
