import { useObservable } from '@/src/hooks/useObservable';
import {
  plannedPaymentReadService,
  type PlannedPaymentObligation,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { of } from 'rxjs';

/** Shared observeById subscription for planned payment form + details. */
export function usePlannedPaymentRecord(workplaceId: WorkplaceId, id: string | undefined | null) {
  const { data: item, isLoading } = useObservable<PlannedPaymentObligation | null>(
    () =>
      id
        ? plannedPaymentReadService.observeObligationById(workplaceId, id as PlannedPaymentId)
        : of(null),
    [id, workplaceId],
    null,
  );

  return { item, isLoading };
}
