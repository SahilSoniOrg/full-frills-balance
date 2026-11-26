import { useCallback, useState } from 'react';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { showDetachFromJournalConfirm } from '@/src/components/transaction-capture/showDetachFromJournalConfirm';
import { resolveSelectedItemById } from '@/src/features/settings/utils/resolveInboxModalItem';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { JournalDisplayType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import type { EnrichedJournal } from '@/src/types/domainReadModels';
import { TransactionInboxImportOptions } from '@/src/services/sms/transactionInboxImport';
import { smsService } from '@/src/services/sms-service';
import { analytics } from '@/src/services/analytics';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { showErrorAlert, toast } from '@/src/services/feedback/alerts';

interface UseTransactionInboxModalsProps {
  workplaceId: WorkplaceId;
  items: readonly TransactionInboxItem[];
  handleImport: (item: TransactionInboxItem, options?: TransactionInboxImportOptions) => void;
}

export interface TransactionInboxModals {
  selectedDuplicateItem: TransactionInboxItem | null;
  selectedEditReparseItem: TransactionInboxItem | null;
  isDuplicateModalVisible: boolean;
  isEditReparseModalVisible: boolean;
  handleOpenDuplicateModal: (item: TransactionInboxItem) => void;
  handleCloseDuplicateModal: () => void;
  handleDismissDuplicateModal: () => void;
  handleOpenEditReparseModal: (item: TransactionInboxItem) => void;
  handleCloseEditReparseModal: () => void;
  handleDismissEditReparseModal: () => void;
  handleOpenAttachToJournal: (item: TransactionInboxItem) => void;
  handleDetachFromJournal: (item: TransactionInboxItem) => void;
  handleMergeDuplicate: (item: TransactionInboxItem) => Promise<void>;
  handleSplitImport: (item: TransactionInboxItem) => void;
  handleViewJournalFromDuplicate: (item: TransactionInboxItem) => void;
}

function linkedJournalAsEnriched(
  linked: NonNullable<TransactionInboxItem['linkedJournal']>,
): EnrichedJournal | null {
  if (linked.totalAmount == null || !linked.currencyCode) return null;
  return {
    id: linked.journalId,
    journalDate: linked.journalDate,
    description: linked.description,
    currencyCode: linked.currencyCode,
    status: linked.status,
    totalAmount: linked.totalAmount,
    transactionCount: 0,
    displayType: JournalDisplayType.EXPENSE,
    accounts: [],
  };
}

type InboxModal =
  | { kind: 'closed' }
  | { kind: 'duplicate' | 'editReparse'; open: boolean; workplaceId: WorkplaceId; itemId: string };

export function useTransactionInboxModals({
  workplaceId,
  items,
  handleImport,
}: UseTransactionInboxModalsProps): TransactionInboxModals {
  const { defaultCurrencyCode } = useWorkplace();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const [modal, setModal] = useState<InboxModal>({ kind: 'closed' });

  // Workplace mismatch keeps the modal closed without an effect reset.
  const resolveSelected = (kind: 'duplicate' | 'editReparse') => {
    if (modal.kind !== kind || modal.workplaceId !== workplaceId) return null;
    return resolveSelectedItemById(items, modal.itemId);
  };

  const selectedDuplicateItem = resolveSelected('duplicate');
  const selectedEditReparseItem = resolveSelected('editReparse');
  const isDuplicateModalVisible =
    modal.kind === 'duplicate' && modal.workplaceId === workplaceId && modal.open;
  const isEditReparseModalVisible =
    modal.kind === 'editReparse' && modal.workplaceId === workplaceId && modal.open;

  const handleOpenDuplicateModal = useCallback(
    (item: TransactionInboxItem) => {
      setModal({ kind: 'duplicate', open: true, workplaceId, itemId: item.id });
    },
    [workplaceId],
  );

  const handleCloseDuplicateModal = useCallback(() => {
    setModal(current => (current.kind === 'duplicate' ? { ...current, open: false } : current));
  }, []);

  const handleDismissDuplicateModal = useCallback(() => {
    setModal(current =>
      current.kind === 'duplicate' && !current.open ? { kind: 'closed' } : current,
    );
  }, []);

  const handleOpenEditReparseModal = useCallback(
    (item: TransactionInboxItem) => {
      setModal({ kind: 'editReparse', open: true, workplaceId, itemId: item.id });
    },
    [workplaceId],
  );

  const handleCloseEditReparseModal = useCallback(() => {
    setModal(current => (current.kind === 'editReparse' ? { ...current, open: false } : current));
  }, []);

  const handleDismissEditReparseModal = useCallback(() => {
    setModal(current =>
      current.kind === 'editReparse' && !current.open ? { kind: 'closed' } : current,
    );
  }, []);

  const handleOpenAttachToJournal = useCallback((item: TransactionInboxItem) => {
    analytics.trackFeatureUsage('sms', 'inbox_accept', {
      channel: item.channel,
      action: 'attach_to_journal_open',
    });
    AppNavigation.toJournalSearch({
      attachInboxId: item.id,
      attachInboxChannel: item.channel,
    });
  }, []);

  const handleDetachFromJournal = useCallback(
    (item: TransactionInboxItem) => {
      if (!item.linkedJournal) return;
      showDetachFromJournalConfirm({
        workplaceId,
        inboxId: item.id,
        channel: item.channel,
        journal: linkedJournalAsEnriched(item.linkedJournal),
        journalLabel: item.linkedJournal.description?.trim() || 'this journal',
        hourCycle: resolvedHourCycle,
        defaultCurrencyCode,
      });
    },
    [defaultCurrencyCode, resolvedHourCycle, workplaceId],
  );

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
    isDuplicateModalVisible,
    isEditReparseModalVisible,
    handleOpenDuplicateModal,
    handleCloseDuplicateModal,
    handleDismissDuplicateModal,
    handleOpenEditReparseModal,
    handleCloseEditReparseModal,
    handleDismissEditReparseModal,
    handleOpenAttachToJournal,
    handleDetachFromJournal,
    handleMergeDuplicate,
    handleSplitImport,
    handleViewJournalFromDuplicate,
  };
}
