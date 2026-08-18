import { useObservable, UseObservableResult } from '@/src/hooks/useObservable';
import { workplaceService } from '@/src/services/WorkplaceService';
import { PlainWorkplace, WorkplaceId } from '@/src/types/domain';
import { of } from 'rxjs';

/**
 * Live workplace record for a given id via `useObservable`.
 * Prefer this over ad-hoc `observeWorkplace` / `useEffect` subscriptions.
 */
export function useWorkplaceSnapshot(
  workplaceId: WorkplaceId | undefined | null,
): UseObservableResult<PlainWorkplace | null> {
  return useObservable<PlainWorkplace | null>(
    () => (workplaceId ? workplaceService.observeWorkplace(workplaceId) : of(null)),
    [workplaceId],
    null,
  );
}
