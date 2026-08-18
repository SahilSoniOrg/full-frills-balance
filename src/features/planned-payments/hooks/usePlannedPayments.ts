import { useObservable } from '@/src/hooks/useObservable';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { PlainPlannedPayment, WorkplaceId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo } from 'react';

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

  const onItemPress = useCallback((item: PlainPlannedPayment) => {
    AppNavigation.toPlannedPaymentDetails(item.id, {
      description: item.name,
      amount: item.amount,
      currency: item.currencyCode,
      nextDate: item.nextOccurrence,
    });
  }, []);

  return {
    items,
    isLoading,
    onItemPress,
  };
}
