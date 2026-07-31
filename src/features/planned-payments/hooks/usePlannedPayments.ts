import PlannedPayment from '@/src/data/models/PlannedPayment';
import { useObservable } from '@/src/hooks/useObservable';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { useMemo } from 'react';
import { WorkplaceId } from '@/src/types/domain';

export function usePlannedPayments(workplaceId: WorkplaceId) {
  const observable = useMemo(
    () => plannedPaymentReadService.observeAll(workplaceId),
    [workplaceId],
  );

  const { data: items, isLoading } = useObservable<PlannedPayment[]>(
    () => observable,
    [workplaceId],
    [] as PlannedPayment[],
  );

  return {
    items,
    isLoading,
  };
}
