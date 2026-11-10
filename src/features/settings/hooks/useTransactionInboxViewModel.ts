import type { SmsInboxCursor } from '@/src/types/smsInbox';
import { AppConfig } from '@/src/constants/app-config';
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
import { preferences } from '@/src/services/preferences';
import {
  recognitionRefreshState,
  refreshSmsRecognitionBestEffort,
  type RecognitionRefreshState,
} from '@/src/services/sms/refreshSmsRecognition';
import { InboxProcessingStatus } from '@/src/types/enums';
import { PlainInboxRecord } from '@/src/types/plainDtos';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import { syncGmailForWorkplace } from '@/src/services/email/gmailSyncService';
import { useRef, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

export type InboxFilter = SmsInboxFilterStatus;

const PAGE_SIZE = 25;

export interface TransactionInboxViewModel extends TransactionInboxModals {
  filter: InboxFilter;
  setFilter: (filter: InboxFilter) => void;
  items: TransactionInboxItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  retry: () => void;
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
  handleRepairOldUpiMerchants: () => void;
  isRepairingOldUpiMerchants: boolean;
  showOldUpiMerchantRepair: boolean;
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
  const [isRepairingOldUpiMerchants, setIsRepairingOldUpiMerchants] = useState(false);
  const showOldUpiMerchantRepair = useSyncExternalStore(
    onStoreChange => {
      const subscription = preferences.workplace
        .observe(workplaceId, 'historicalSmsMerchantRepairVersion')
        .subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () =>
      preferences.workplace.getSnapshot(workplaceId).historicalSmsMerchantRepairVersion !==
      AppConfig.migrations.historicalSmsMerchantRepair,
    () =>
      preferences.workplace.getSnapshot(workplaceId).historicalSmsMerchantRepairVersion !==
      AppConfig.migrations.historicalSmsMerchantRepair,
  );
  const [recognitionState, setRecognitionState] = useState<RecognitionRefreshState>(
    () => recognitionRefreshState(workplaceId).value,
  );
  useEffect(() => {
    const state = recognitionRefreshState(workplaceId);
    const subscription = state.subscribe(setRecognitionState);
    if (state.value === 'failed') void refreshSmsRecognitionBestEffort(workplaceId);
    return () => subscription.unsubscribe();
  }, [workplaceId]);

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

  const { items, isLoading, isLoadingMore, hasMore, loadMore, error, retry } =
    usePaginatedObservable<PlainInboxRecord, TransactionInboxItem>({
      pageSize: PAGE_SIZE,
      observe,
      enrich,
    });

  useEffect(() => {
    let isMounted = true;
    const prime = async () => {
      try {
        if (Platform.OS !== 'android') return;
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
    retry();
    setIsRefreshing(true);
    analytics.trackFeatureUsage('sms', 'inbox_bulk_sync', { mode: 'refresh' });
    try {
      if (Platform.OS === 'android') {
        const result = await smsService.scanRecentSmsPage(workplaceId, PAGE_SIZE * 2);
        setScanCursor(result.cursor);
        setHasOlderMessages(result.hasMore);
      }
      if (Platform.OS !== 'web') await syncGmailForWorkplace(workplaceId);
      toast.success('Transaction inbox refreshed');
    } catch (error) {
      showErrorAlert(error, 'Transaction Inbox', true);
    } finally {
      setIsRefreshing(false);
    }
  }, [workplaceId, retry]);

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

  const handleRepairOldUpiMerchants = useCallback(() => {
    if (isRepairingOldUpiMerchants) return;
    confirm.show({
      title: 'Repair old UPI merchant names?',
      message:
        'This repairs linked SMS merchant details and Suggestions from SMS history in this workspace when the old parser cut a UPI ID at its first period. Amounts and posted journal entries will not change.',
      confirmText: 'Repair names',
      cancelText: 'Cancel',
      onConfirm: () => {
        setIsRepairingOldUpiMerchants(true);
        void smsService
          .repairLegacyUpiMerchants(workplaceId)
          .then(count => {
            toast.success(
              count
                ? `Repaired ${count} old SMS merchant ${count === 1 ? 'name' : 'names'}`
                : 'No truncated UPI merchant names found',
            );
          })
          .catch(error => showErrorAlert(error, 'Repair old SMS merchant names', true))
          .finally(() => setIsRepairingOldUpiMerchants(false));
      },
    });
  }, [isRepairingOldUpiMerchants, workplaceId]);

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
    items:
      recognitionState === 'ready'
        ? items
        : items.map(item =>
            item.channel === 'sms' && item.processingStatus === InboxProcessingStatus.PENDING
              ? { ...item, recognitionRefreshState: recognitionState }
              : item,
          ),
    isLoading,
    isLoadingMore,
    error,
    retry,
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
    handleRepairOldUpiMerchants,
    isRepairingOldUpiMerchants,
    showOldUpiMerchantRepair,
    filterButtons,
    defaultCurrencyCode,
    ...modals,
  };
}
