import PlannedPayment from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { of } from 'rxjs';

/** Shared observeById subscription for planned payment form + details. */
export function usePlannedPaymentRecord(workplaceId: WorkplaceId, id: string | undefined | null) {
  const { data: item, isLoading } = useObservable<PlannedPayment | null>(
    () =>
      id ? plannedPaymentRepository.observeById(workplaceId, id as PlannedPaymentId) : of(null),
    [id, workplaceId],
    null,
  );

  return { item, isLoading };
}
