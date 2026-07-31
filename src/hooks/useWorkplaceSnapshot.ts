import Workplace from '@/src/data/models/Workplace';
import { useObservable, UseObservableResult } from '@/src/hooks/useObservable';
import { workplaceService } from '@/src/services/WorkplaceService';
import { WorkplaceId } from '@/src/types/domain';
import { of } from 'rxjs';

/**
 * Live workplace record for a given id via `useObservable`.
 * Prefer this over ad-hoc `observeWorkplace` / `useEffect` subscriptions.
 */
export function useWorkplaceSnapshot(
  workplaceId: WorkplaceId | undefined | null,
): UseObservableResult<Workplace | null> {
  return useObservable<Workplace | null>(
    () => (workplaceId ? workplaceService.observeWorkplace(workplaceId) : of(null)),
    [workplaceId],
    null,
  );
}
