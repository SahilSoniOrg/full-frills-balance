import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import { useAccounts } from '@/src/features/accounts';
import { enrichTransactionInboxRecords } from '@/src/features/settings/hooks/transactionInboxMapping';
import { useTransactionInboxImport } from '@/src/features/settings/hooks/useTransactionInboxImport';
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable';
import { analytics } from '@/src/services/analytics-service';
import { smsService } from '@/src/services/sms-service';
import { TransactionInboxItem } from '@/src/types/domain';
import { showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type InboxFilter = 'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed';

const PAGE_SIZE = 25;

export interface TransactionInboxViewModel {
  filter: InboxFilter;
  setFilter: (filter: InboxFilter) => void;
  items: TransactionInboxItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isRefreshing: boolean;
  isScanningOlder: boolean;
  handleRefresh: () => Promise<void>;
  handleLoadOlder: () => Promise<void>;
  handleDismiss: (item: TransactionInboxItem) => Promise<void>;
  handleUndismiss: (item: TransactionInboxItem) => Promise<void>;
  handleImport: (item: TransactionInboxItem) => void;
  handleCompareDuplicate: (item: TransactionInboxItem) => void;
  handleOpenJournal: (item: TransactionInboxItem) => void;
  filterButtons: { key: InboxFilter; label: string }[];
  defaultCurrencyCode: string;
}

export function useTransactionInboxViewModel(): TransactionInboxViewModel {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { accounts } = useAccounts(workplaceId);
  const handleImport = useTransactionInboxImport({ accounts, workplaceId });

  const [filter, setFilter] = useState<InboxFilter>('pending');
  const [scanCursor, setScanCursor] = useState(PAGE_SIZE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanningOlder, setIsScanningOlder] = useState(false);

  const observe = useCallback(
    (limit: number) => smsService.observeInbox(workplaceId, limit, { status: filter }),
    [filter, workplaceId],
  );

  const enrich = useCallback(
    (records: TransactionInboxRecord[]) => enrichTransactionInboxRecords(workplaceId, records),
    [workplaceId],
  );

  const { items, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedObservable<
    TransactionInboxRecord,
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
      const result = await smsService.refreshLatestSms(workplaceId, PAGE_SIZE * 2);
      setScanCursor(result.cursor);
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
      loadMore();
    } catch (error) {
      showErrorAlert(error, 'Transaction Inbox', true);
    } finally {
      setIsScanningOlder(false);
    }
  }, [isScanningOlder, loadMore, scanCursor, workplaceId]);

  const handleDismiss = useCallback(async (item: TransactionInboxItem) => {
    analytics.trackFeatureUsage('sms', 'inbox_dismiss', {
      channel: item.channel,
      direction: item.direction,
    });
    await smsService.markInboxRecordStatus(item.id, InboxProcessingStatus.DISMISSED);
    if (item.channel === 'sms') {
      await smsService.markSmsAsProcessed(item.deviceSourceId);
    }
  }, []);

  const handleUndismiss = useCallback(async (item: TransactionInboxItem) => {
    await smsService.markInboxRecordStatus(
      item.id,
      item.duplicateCandidate
        ? InboxProcessingStatus.DUPLICATE_FLAGGED
        : InboxProcessingStatus.PENDING,
    );
  }, []);

  const handleCompareDuplicate = useCallback(
    (item: TransactionInboxItem) => {
      if (!item.duplicateCandidate) return;
      AppNavigation.toJournalDetails(item.duplicateCandidate.journalId, {
        title:
          item.duplicateCandidate.description || item.parsedMerchant || item.senderAddress || '',
        amount: item.parsedAmount || 0,
        currencyCode: item.parsedCurrencyCode || defaultCurrencyCode,
        date: item.duplicateCandidate.journalDate,
        displayType: item.direction === 'credit' ? 'INCOME' : 'EXPENSE',
      });
    },
    [defaultCurrencyCode],
  );

  const handleOpenJournal = useCallback(
    (item: TransactionInboxItem) => {
      if (!item.linkedJournal) return;
      analytics.trackFeatureUsage('sms', 'inbox_accept', {
        channel: item.channel,
      });
      AppNavigation.toJournalDetails(item.linkedJournal.journalId, {
        title: item.linkedJournal.description || item.parsedMerchant || item.senderAddress || '',
        amount: item.parsedAmount || 0,
        currencyCode: item.parsedCurrencyCode || defaultCurrencyCode,
        date: item.linkedJournal.journalDate,
        displayType: item.direction === 'credit' ? 'INCOME' : 'EXPENSE',
      });
    },
    [defaultCurrencyCode],
  );

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
    isRefreshing,
    isScanningOlder,
    handleRefresh,
    handleLoadOlder,
    handleDismiss,
    handleUndismiss,
    handleImport,
    handleCompareDuplicate,
    handleOpenJournal,
    filterButtons,
    defaultCurrencyCode,
  };
}
