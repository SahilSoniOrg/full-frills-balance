import { useObservable } from '@/src/hooks/useObservable';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { useMemo } from 'react';
import { PlainPlannedPayment, WorkplaceId } from '@/src/types/domain';

export function usePlannedPayments(workplaceId: WorkplaceId) {
  const observable = useMemo(
    () => plannedPaymentReadService.observeAll(workplaceId),
    [workplaceId],
  );

  const { data: items, isLoading } = useObservable<PlainPlannedPayment[]>(
    () => observable,
    [workplaceId],
    [] as PlainPlannedPayment[],
  );

  return {
    items,
    isLoading,
  };
}
