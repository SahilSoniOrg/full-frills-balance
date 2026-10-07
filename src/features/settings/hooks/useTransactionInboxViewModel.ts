import type { SmsInboxCursor } from '@/src/types/smsInbox';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useAccounts } from '@/src/components/account-selection';
import { enrichTransactionInboxRecords } from '@/src/features/settings/hooks/transactionInboxMapping';
import { useTransactionInboxImport } from '@/src/features/settings/hooks/useTransactionInboxImport';
import {
  TransactionInboxModals,
  useTransactionInboxModals,
} from '@/src/features/settings/hooks/useTransactionInboxModals';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { analytics } from '@/src/services/analytics';
import { smsService, type SmsInboxFilterStatus } from '@/src/services/sms-service';
import { InboxProcessingStatus } from '@/src/types/enums';
import { PlainInboxRecord } from '@/src/types/plainDtos';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useCallback, useEffect, useMemo, useState } from 'react';

export type InboxFilter = SmsInboxFilterStatus;

const PAGE_SIZE = 25;

export interface TransactionInboxViewModel extends TransactionInboxModals {
  filter: InboxFilter;
  setFilter: (filter: InboxFilter) => void;
  items: TransactionInboxItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  hasOlderMessages: boolean;
  handleLoadMore: () => void;
  isRefreshing: boolean;
  isScanningOlder: boolean;
  handleRefresh: () => Promise<void>;
  handleLoadOlder: () => Promise<void>;
  handleDismiss: (item: TransactionInboxItem) => Promise<void>;
  handleUndismiss: (item: TransactionInboxItem) => Promise<void>;
  handleImport: (item: TransactionInboxItem) => void;
  handleOpenJournal: (item: TransactionInboxItem) => void;
  filterButtons: { key: InboxFilter; label: string }[];
  defaultCurrencyCode: string;
}

export function useTransactionInboxViewModel(): TransactionInboxViewModel {
  const { reviewRecordId } = useLocalSearchParams<{ reviewRecordId?: string }>();
  const reviewing = useRef<string | null>(null);
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { accounts, isLoading: areAccountsLoading } = useAccounts(workplaceId);
  const handleImport = useTransactionInboxImport({ accounts, workplaceId });

  const [filter, setFilter] = useState<InboxFilter>('pending');
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [scanCursor, setScanCursor] = useState<SmsInboxCursor | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanningOlder, setIsScanningOlder] = useState(false);

  const modals = useTransactionInboxModals({
    workplaceId,
    handleImport,
  });

  const observe = useCallback(
    (limit: number) => smsService.observeInbox(workplaceId, limit, { status: filter }),
    [filter, workplaceId],
  );

  const enrich = useCallback(
    (records: PlainInboxRecord[]) => enrichTransactionInboxRecords(workplaceId, records),
    [workplaceId],
  );

  const { items, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedObservable<
    PlainInboxRecord,
    TransactionInboxItem
  >({
    pageSize: PAGE_SIZE,
    observe,
    enrich,
  });

  useEffect(() => {
    let isMounted = true;
    const prime = async () => {
      try {
        const result = await smsService.scanRecentSmsPage(workplaceId, PAGE_SIZE * 2);
        if (isMounted) {
          setScanCursor(result.cursor);
          setHasOlderMessages(result.hasMore);
        }
      } catch (error) {
        showErrorAlert(error, 'Transaction Inbox', true);
      }
    };
    prime();
    return () => {
      isMounted = false;
    };
  }, [workplaceId]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    analytics.trackFeatureUsage('sms', 'inbox_bulk_sync', { mode: 'refresh' });
    try {
      const result = await smsService.scanRecentSmsPage(workplaceId, PAGE_SIZE * 2);
      setScanCursor(result.cursor);
      setHasOlderMessages(result.hasMore);
      toast.success('Transaction inbox refreshed');
    } catch (error) {
      showErrorAlert(error, 'Transaction Inbox', true);
    } finally {
      setIsRefreshing(false);
    }
  }, [workplaceId]);

  const handleLoadOlder = useCallback(async () => {
    if (isScanningOlder) return;
    setIsScanningOlder(true);
    analytics.trackFeatureUsage('sms', 'inbox_bulk_sync', { mode: 'scan_older' });
    try {
      const result = await smsService.scanOlderSmsPage(scanCursor, workplaceId, PAGE_SIZE);
      setScanCursor(result.cursor);
      setHasOlderMessages(result.hasMore);
      loadMore();
    } catch (error) {
      showErrorAlert(error, 'Transaction Inbox', true);
    } finally {
      setIsScanningOlder(false);
    }
  }, [isScanningOlder, loadMore, scanCursor, workplaceId]);

  const handleDismiss = useCallback(
    async (item: TransactionInboxItem) => {
      analytics.trackFeatureUsage('sms', 'inbox_dismiss', {
        channel: item.channel,
        direction: item.direction,
      });
      await smsService.markInboxRecordStatus(workplaceId, item.id, InboxProcessingStatus.DISMISSED);
    },
    [workplaceId],
  );

  const handleUndismiss = useCallback(
    async (item: TransactionInboxItem) => {
      await smsService.markInboxRecordStatus(
        workplaceId,
        item.id,
        item.duplicateCandidate
          ? InboxProcessingStatus.DUPLICATE_FLAGGED
          : InboxProcessingStatus.PENDING,
      );
    },
    [workplaceId],
  );

  const handleOpenJournal = useCallback((item: TransactionInboxItem) => {
    if (!item.linkedJournal) return;
    analytics.trackFeatureUsage('sms', 'inbox_accept', {
      channel: item.channel,
    });
    AppNavigation.toJournalDetails(item.linkedJournal.journalId);
  }, []);

  useEffect(() => {
    if (!reviewRecordId || areAccountsLoading || reviewing.current === reviewRecordId) return;
    let cancelled = false;
    reviewing.current = reviewRecordId;
    void (async () => {
      const record = await smsService.findInboxRecord(workplaceId, reviewRecordId);
      if (cancelled) return;
      if (record) {
        const [item] = await enrichTransactionInboxRecords(workplaceId, [record]);
        if (cancelled) return;
        if (item.linkedJournal) handleOpenJournal(item);
        else if (
          item.processingStatus === InboxProcessingStatus.PENDING ||
          item.processingStatus === InboxProcessingStatus.PARSE_FAILED
        )
          await handleImport(item);
      }
      if (!cancelled) router.setParams({ reviewRecordId: undefined });
    })().catch(error => showErrorAlert(error, 'SMS review', true));
    return () => {
      cancelled = true;
      reviewing.current = null;
    };
  }, [reviewRecordId, workplaceId, areAccountsLoading, handleImport, handleOpenJournal]);

  const filterButtons = useMemo(
    () => [
      { key: 'pending' as InboxFilter, label: 'Pending' },
      { key: 'processed' as InboxFilter, label: 'Processed' },
      { key: 'auto_posted' as InboxFilter, label: 'Auto-Posted' },
      { key: 'duplicates' as InboxFilter, label: 'Duplicates' },
      { key: 'failed' as InboxFilter, label: 'Failed' },
    ],
    [],
  );

  return {
    filter,
    setFilter,
    items,
    isLoading,
    isLoadingMore,
    hasMore,
    hasOlderMessages,
    handleLoadMore: loadMore,
    isRefreshing,
    isScanningOlder,
    handleRefresh,
    handleLoadOlder,
    handleDismiss,
    handleUndismiss,
    handleImport,
    handleOpenJournal,
    filterButtons,
    defaultCurrencyCode,
    ...modals,
  };
}
