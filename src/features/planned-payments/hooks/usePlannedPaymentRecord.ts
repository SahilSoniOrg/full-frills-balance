import PlannedPayment from '@/src/data/models/PlannedPayment';
import { useObservable } from '@/src/hooks/useObservable';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/domain';
import { of } from 'rxjs';

/** Shared observeById subscription for planned payment form + details. */
export function usePlannedPaymentRecord(workplaceId: WorkplaceId, id: string | undefined | null) {
  const { data: item, isLoading } = useObservable<PlannedPayment | null>(
    () =>
      id ? plannedPaymentReadService.observeById(workplaceId, id as PlannedPaymentId) : of(null),
    [id, workplaceId],
    null,
  );

  return { item, isLoading };
}
