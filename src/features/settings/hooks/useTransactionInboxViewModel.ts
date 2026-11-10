import { useAccounts } from '@/src/components/account-selection';
import { useTransactionInboxImport } from '@/src/features/settings/hooks/useTransactionInboxImport';
import {
  TransactionInboxModals,
  useTransactionInboxModals,
} from '@/src/features/settings/hooks/useTransactionInboxModals';
import { useInboxDeepLink } from '@/src/features/settings/hooks/useInboxDeepLink';
import { useInboxScanActions } from '@/src/features/settings/hooks/useInboxScanActions';
import { useTransactionInboxData } from '@/src/features/settings/hooks/useTransactionInboxData';
import { analytics } from '@/src/services/analytics';
import { smsService, type SmsInboxFilterStatus } from '@/src/services/sms-service';
import { InboxProcessingStatus } from '@/src/types/enums';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

export type { SmsInboxFilterStatus };

export interface TransactionInboxViewModel extends TransactionInboxModals {
  filter: SmsInboxFilterStatus;
  setFilter: (filter: SmsInboxFilterStatus) => void;
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
  filterButtons: { key: SmsInboxFilterStatus; label: string }[];
  defaultCurrencyCode: string;
}

export function useTransactionInboxViewModel(): TransactionInboxViewModel {
  const data = useTransactionInboxData();
  const { accounts } = useAccounts(data.workplaceId);
  const handleImport = useTransactionInboxImport({
    accounts,
    workplaceId: data.workplaceId,
  });
  const scan = useInboxScanActions({
    workplaceId: data.workplaceId,
    pageSize: data.pageSize,
    retry: data.retry,
    loadMore: data.handleLoadMore,
  });

  const modals = useTransactionInboxModals({
    workplaceId: data.workplaceId,
    items: data.items,
    handleImport,
  });

  const handleDismiss = useCallback(
    async (item: TransactionInboxItem) => {
      analytics.trackFeatureUsage('sms', 'inbox_dismiss', {
        channel: item.channel,
        direction: item.direction,
      });
      await smsService.markInboxRecordStatus(
        data.workplaceId,
        item.id,
        InboxProcessingStatus.DISMISSED,
      );
    },
    [data.workplaceId],
  );

  const handleUndismiss = useCallback(
    async (item: TransactionInboxItem) => {
      await smsService.markInboxRecordStatus(
        data.workplaceId,
        item.id,
        item.duplicateCandidate
          ? InboxProcessingStatus.DUPLICATE_FLAGGED
          : InboxProcessingStatus.PENDING,
      );
    },
    [data.workplaceId],
  );

  const handleOpenJournal = useCallback((item: TransactionInboxItem) => {
    if (!item.linkedJournal) return;
    analytics.trackFeatureUsage('sms', 'inbox_accept', {
      channel: item.channel,
    });
    AppNavigation.toJournalDetails(item.linkedJournal.journalId);
  }, []);

  useInboxDeepLink({
    workplaceId: data.workplaceId,
    handleImport,
    handleOpenJournal,
  });

  return {
    filter: data.filter,
    setFilter: data.setFilter,
    items: data.items,
    isLoading: data.isLoading,
    isLoadingMore: data.isLoadingMore,
    error: data.error,
    retry: data.retry,
    hasMore: data.hasMore,
    hasOlderMessages: scan.hasOlderMessages,
    handleLoadMore: data.handleLoadMore,
    isRefreshing: scan.isRefreshing,
    isScanningOlder: scan.isScanningOlder,
    handleRefresh: scan.handleRefresh,
    handleLoadOlder: scan.handleLoadOlder,
    handleDismiss,
    handleUndismiss,
    handleImport,
    handleOpenJournal,
    handleRepairOldUpiMerchants: scan.handleRepairOldUpiMerchants,
    isRepairingOldUpiMerchants: scan.isRepairingOldUpiMerchants,
    showOldUpiMerchantRepair: scan.showOldUpiMerchantRepair,
    filterButtons: data.filterButtons,
    defaultCurrencyCode: data.defaultCurrencyCode,
    ...modals,
  };
}
