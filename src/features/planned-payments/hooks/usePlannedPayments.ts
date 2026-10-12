import { useObservable } from '@/src/hooks/useObservable';
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  plannedPaymentReadService,
  type PlannedPaymentObligation,
  type PlannedPaymentListData,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { WorkplaceId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo } from 'react';
import {
  buildPlannedPaymentListPresentation,
  withPlannedJournals,
} from './plannedPaymentListPresentation';
import { AppConfig } from '@/src/constants';
import { useJournals } from '@/src/features/journal';
import { JournalStatus } from '@/src/types/enums';

const PLANNED_STATUS = [JournalStatus.PLANNED];

const EMPTY_LIST_DATA: PlannedPaymentListData = { items: [], savedOccurrences: [] };

export function usePlannedPayments(workplaceId: WorkplaceId) {
  const { defaultCurrencyCode } = useWorkplace();
  const now = useCalendarDay();
  const {
    data: snapshot,
    isLoading,
    error,
    retry,
  } = useObservable<PlannedPaymentListData | null>(
    () => plannedPaymentReadService.observeListData(workplaceId),
    [workplaceId, now],
    null,
    { keepPreviousData: false },
  );
  const { journals: plannedJournals } = useJournals(
    workplaceId,
    AppConfig.defaults.plannedJournalLimit,
    undefined,
    undefined,
    PLANNED_STATUS,
  );
  const data = useMemo(
    () => withPlannedJournals(snapshot ?? EMPTY_LIST_DATA, plannedJournals),
    [snapshot, plannedJournals],
  );
  const items = data.items;
  const listData = useMemo(
    () => buildPlannedPaymentListPresentation(data, defaultCurrencyCode, now),
    [data, defaultCurrencyCode, now],
  );

  const onItemPress = useCallback((item: PlannedPaymentObligation) => {
    if (item.journalOnly) return AppNavigation.toJournalDetails(item.id);
    AppNavigation.toPlannedPaymentDetails(item.id, {
      description: item.name,
      amount: item.amount,
      currency: item.currencyCode,
      nextDate: item.nextDueOccurrence,
    });
  }, []);

  return {
    items,
    listData,
    isLoading,
    error,
    retry,
    onItemPress,
  };
}
