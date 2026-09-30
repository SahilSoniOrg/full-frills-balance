import { useObservable } from '@/src/hooks/useObservable';
import {
  plannedPaymentReadService,
  type PlannedPaymentObligation,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo } from 'react';

export function usePlannedPayments(workplaceId: WorkplaceId) {
  const observable = useMemo(
    () => plannedPaymentReadService.observeObligations(workplaceId),
    [workplaceId],
  );

  const {
    data: items,
    isLoading,
    error,
    retry,
  } = useObservable<PlannedPaymentObligation[]>(
    () => observable,
    [workplaceId],
    [] as PlannedPaymentObligation[],
  );

  const onItemPress = useCallback((item: PlannedPaymentObligation) => {
    AppNavigation.toPlannedPaymentDetails(item.id, {
      description: item.name,
      amount: item.amount,
      currency: item.currencyCode,
      nextDate: item.nextDueOccurrence,
    });
  }, []);

  return {
    items,
    isLoading,
    error,
    retry,
    onItemPress,
  };
}
