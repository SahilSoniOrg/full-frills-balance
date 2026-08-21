import { useCallback, useState } from 'react';
import { TransactionInboxItem, WorkplaceId } from '@/src/types/domain';
import { TransactionInboxImportOptions } from '@/src/services/sms/transactionInboxImport';
import { smsService } from '@/src/services/sms-service';
import { analytics } from '@/src/services/analytics';
import { AppNavigation } from '@/src/utils/navigation';
import { showErrorAlert, toast } from '@/src/utils/alerts';

interface UseTransactionInboxModalsProps {
  workplaceId: WorkplaceId;
  defaultCurrencyCode: string;
  handleImport: (item: TransactionInboxItem, options?: TransactionInboxImportOptions) => void;
}

export interface TransactionInboxModals {
  selectedDuplicateItem: TransactionInboxItem | null;
  selectedEditReparseItem: TransactionInboxItem | null;
  handleOpenDuplicateModal: (item: TransactionInboxItem) => void;
  handleCloseDuplicateModal: () => void;
  handleOpenEditReparseModal: (item: TransactionInboxItem) => void;
  handleCloseEditReparseModal: () => void;
  handleMergeDuplicate: (item: TransactionInboxItem) => Promise<void>;
  handleCreateRuleFromItem: (item: TransactionInboxItem) => void;
  handleSplitImport: (item: TransactionInboxItem) => void;
  handleViewJournalFromDuplicate: (item: TransactionInboxItem) => void;
}

export function useTransactionInboxModals({
  workplaceId,
  defaultCurrencyCode,
  handleImport,
}: UseTransactionInboxModalsProps): TransactionInboxModals {
  const [selectedDuplicateItem, setSelectedDuplicateItem] = useState<TransactionInboxItem | null>(
    null,
  );
  const [selectedEditReparseItem, setSelectedEditReparseItem] =
    useState<TransactionInboxItem | null>(null);

  const handleOpenDuplicateModal = useCallback((item: TransactionInboxItem) => {
    setSelectedDuplicateItem(item);
  }, []);

  const handleCloseDuplicateModal = useCallback(() => {
    setSelectedDuplicateItem(null);
  }, []);

  const handleOpenEditReparseModal = useCallback((item: TransactionInboxItem) => {
    setSelectedEditReparseItem(item);
  }, []);

  const handleCloseEditReparseModal = useCallback(() => {
    setSelectedEditReparseItem(null);
  }, []);

  const handleMergeDuplicate = useCallback(
    async (item: TransactionInboxItem) => {
      if (!item.duplicateCandidate) return;
      analytics.trackFeatureUsage('sms', 'inbox_accept', {
        channel: item.channel,
        action: 'merge_duplicate',
      });
      try {
        await smsService.finalizeManualImport(
          workplaceId,
          item.id,
          item.duplicateCandidate.journalId,
        );
        if (item.channel === 'sms') {
          smsService.markSmsAsProcessed(item.deviceSourceId);
        }
        toast.success('SMS details merged into journal');
      } catch (error) {
        showErrorAlert(error, 'Merge Duplicate', true);
      }
    },
    [workplaceId],
  );

  const handleCreateRuleFromItem = useCallback((item: TransactionInboxItem) => {
    analytics.trackFeatureUsage('sms', 'inbox_accept', {
      channel: item.channel,
      action: 'create_rule',
    });
    AppNavigation.toSmsRuleForm(undefined, {
      senderMatch: item.senderAddress || undefined,
      bodyMatch: item.parsedMerchant || undefined,
    });
  }, []);

  const handleSplitImport = useCallback(
    (item: TransactionInboxItem) => {
      analytics.trackFeatureUsage('sms', 'inbox_accept', {
        channel: item.channel,
        action: 'split_import',
      });
      handleImport(item, { mode: 'split' });
    },
    [handleImport],
  );

  const handleViewJournalFromDuplicate = useCallback(
    (item: TransactionInboxItem) => {
      if (!item.duplicateCandidate) return;
      AppNavigation.toJournalDetails(item.duplicateCandidate.journalId, {
        title:
          item.duplicateCandidate.description || item.parsedMerchant || item.senderAddress || '',
        amount: item.duplicateCandidate.totalAmount || item.parsedAmount || 0,
        currencyCode:
          item.duplicateCandidate.currencyCode || item.parsedCurrencyCode || defaultCurrencyCode,
        date: item.duplicateCandidate.journalDate,
        displayType: item.direction === 'credit' ? 'INCOME' : 'EXPENSE',
      });
    },
    [defaultCurrencyCode],
  );

  return {
    selectedDuplicateItem,
    selectedEditReparseItem,
    handleOpenDuplicateModal,
    handleCloseDuplicateModal,
    handleOpenEditReparseModal,
    handleCloseEditReparseModal,
    handleMergeDuplicate,
    handleCreateRuleFromItem,
    handleSplitImport,
    handleViewJournalFromDuplicate,
  };
}
