import PlannedPayment from '@/src/data/models/PlannedPayment';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { useMemo } from 'react';
import { WorkplaceId } from '@/src/types/domain';

export function usePlannedPayments(workplaceId: WorkplaceId) {
  const observable = useMemo(() => plannedPaymentRepository.observeAll(workplaceId), [workplaceId]);

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
