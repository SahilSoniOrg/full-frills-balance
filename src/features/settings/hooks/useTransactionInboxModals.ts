import { useCallback, useState } from 'react';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { resolveSelectedItemById } from '@/src/features/settings/utils/resolveInboxModalItem';
import { WorkplaceId } from '@/src/types/ids';
import { TransactionInboxImportOptions } from '@/src/services/sms/transactionInboxImport';
import { smsService } from '@/src/services/sms-service';
import { analytics } from '@/src/services/analytics';
import { AppNavigation } from '@/src/utils/navigation';
import { showErrorAlert, toast } from '@/src/utils/alerts';

interface UseTransactionInboxModalsProps {
  workplaceId: WorkplaceId;
  items: readonly TransactionInboxItem[];
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
  handleSplitImport: (item: TransactionInboxItem) => void;
  handleViewJournalFromDuplicate: (item: TransactionInboxItem) => void;
}

type InboxModal =
  | { kind: 'closed' }
  | { kind: 'duplicate' | 'editReparse'; workplaceId: WorkplaceId; itemId: string };

export function useTransactionInboxModals({
  workplaceId,
  items,
  handleImport,
}: UseTransactionInboxModalsProps): TransactionInboxModals {
  const [modal, setModal] = useState<InboxModal>({ kind: 'closed' });

  // Workplace mismatch keeps the modal closed without an effect reset.
  const resolveSelected = (kind: 'duplicate' | 'editReparse') => {
    if (modal.kind !== kind || modal.workplaceId !== workplaceId) return null;
    return resolveSelectedItemById(items, modal.itemId);
  };

  const selectedDuplicateItem = resolveSelected('duplicate');
  const selectedEditReparseItem = resolveSelected('editReparse');

  const handleOpenDuplicateModal = useCallback(
    (item: TransactionInboxItem) => {
      setModal({ kind: 'duplicate', workplaceId, itemId: item.id });
    },
    [workplaceId],
  );

  const handleCloseDuplicateModal = useCallback(() => {
    setModal(current => (current.kind === 'duplicate' ? { kind: 'closed' } : current));
  }, []);

  const handleOpenEditReparseModal = useCallback(
    (item: TransactionInboxItem) => {
      setModal({ kind: 'editReparse', workplaceId, itemId: item.id });
    },
    [workplaceId],
  );

  const handleCloseEditReparseModal = useCallback(() => {
    setModal(current => (current.kind === 'editReparse' ? { kind: 'closed' } : current));
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
        toast.success(
          item.channel === 'email'
            ? 'Email details merged into journal'
            : 'SMS details merged into journal',
        );
      } catch (error) {
        showErrorAlert(error, 'Merge Duplicate', true);
      }
    },
    [workplaceId],
  );

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

  const handleViewJournalFromDuplicate = useCallback((item: TransactionInboxItem) => {
    if (!item.duplicateCandidate) return;
    AppNavigation.toJournalDetails(item.duplicateCandidate.journalId);
  }, []);

  return {
    selectedDuplicateItem,
    selectedEditReparseItem,
    handleOpenDuplicateModal,
    handleCloseDuplicateModal,
    handleOpenEditReparseModal,
    handleCloseEditReparseModal,
    handleMergeDuplicate,
    handleSplitImport,
    handleViewJournalFromDuplicate,
  };
}
