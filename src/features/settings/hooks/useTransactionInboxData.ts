import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { enrichTransactionInboxRecords } from '@/src/features/settings/hooks/transactionInboxMapping';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { smsService, type SmsInboxFilterStatus } from '@/src/services/sms-service';
import {
  recognitionRefreshState,
  refreshSmsRecognitionBestEffort,
  type RecognitionRefreshState,
} from '@/src/services/sms/refreshSmsRecognition';
import { InboxProcessingStatus } from '@/src/types/enums';
import { PlainInboxRecord } from '@/src/types/plainDtos';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type { SmsInboxFilterStatus };

const PAGE_SIZE = 25;

export function useTransactionInboxData() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const [filter, setFilter] = useState<SmsInboxFilterStatus>('pending');
  const [recognitionState, setRecognitionState] = useState<RecognitionRefreshState>(
    () => recognitionRefreshState(workplaceId).value,
  );

  useEffect(() => {
    const state = recognitionRefreshState(workplaceId);
    const subscription = state.subscribe(setRecognitionState);
    if (state.value === 'failed') void refreshSmsRecognitionBestEffort(workplaceId);
    return () => subscription.unsubscribe();
  }, [workplaceId]);

  const observe = useCallback(
    (limit: number) => smsService.observeInbox(workplaceId, limit, { status: filter }),
    [filter, workplaceId],
  );

  const enrich = useCallback(
    (records: PlainInboxRecord[]) => enrichTransactionInboxRecords(workplaceId, records),
    [workplaceId],
  );

  const { items, isLoading, isLoadingMore, hasMore, loadMore, error, retry } =
    usePaginatedObservable<PlainInboxRecord, TransactionInboxItem>({
      pageSize: PAGE_SIZE,
      observe,
      enrich,
    });

  const displayItems = useMemo(
    () =>
      recognitionState === 'ready'
        ? items
        : items.map(item =>
            item.channel === 'sms' && item.processingStatus === InboxProcessingStatus.PENDING
              ? { ...item, recognitionRefreshState: recognitionState }
              : item,
          ),
    [items, recognitionState],
  );

  const filterButtons = useMemo(
    () => [
      { key: 'pending' as SmsInboxFilterStatus, label: 'Pending' },
      { key: 'processed' as SmsInboxFilterStatus, label: 'Processed' },
      { key: 'auto_posted' as SmsInboxFilterStatus, label: 'Auto-Posted' },
      { key: 'duplicates' as SmsInboxFilterStatus, label: 'Duplicates' },
      { key: 'failed' as SmsInboxFilterStatus, label: 'Failed' },
    ],
    [],
  );

  return {
    workplaceId,
    defaultCurrencyCode,
    filter,
    setFilter,
    items: displayItems,
    isLoading,
    isLoadingMore,
    error,
    retry,
    hasMore,
    handleLoadMore: loadMore,
    filterButtons,
    pageSize: PAGE_SIZE,
  };
}
