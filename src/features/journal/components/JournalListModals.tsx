import { BulkChangeJournalAccountModal } from '@/src/features/journal/components/modals/BulkChangeJournalAccountModal';
import { BulkRenameJournalsModal } from '@/src/features/journal/components/modals/BulkRenameJournalsModal';
import { MergeJournalsModal } from '@/src/features/journal/components/modals/MergeJournalsModal';
import type { JournalActiveModal } from '@/src/features/journal/hooks/useJournalsBulkOperations';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';

export interface JournalListModalsProps {
  activeModal: JournalActiveModal;
  workplaceId?: WorkplaceId;
  onCloseModal: () => void;
  onBulkRenameSave: (namesByJournalId: Record<JournalId, string>) => Promise<void> | void;
  onMergeConfirm: (params: { description: string; journalDate: number }) => Promise<void> | void;
  onBulkChangeAccountSelect: (
    targetLeg: 'debit' | 'credit',
    accountId: AccountId,
  ) => Promise<void> | void;
}

export function JournalListModals({
  activeModal,
  workplaceId,
  onCloseModal,
  onBulkRenameSave,
  onMergeConfirm,
  onBulkChangeAccountSelect,
}: JournalListModalsProps) {
  if (!activeModal) return null;

  if (activeModal.type === 'bulkRename') {
    return (
      <BulkRenameJournalsModal
        visible
        journals={activeModal.journals}
        onClose={onCloseModal}
        onSave={onBulkRenameSave}
      />
    );
  }

  if (activeModal.type === 'merge' && workplaceId) {
    return (
      <MergeJournalsModal
        visible
        workplaceId={workplaceId}
        journalIds={activeModal.journalIds}
        onClose={onCloseModal}
        onConfirmMerge={onMergeConfirm}
      />
    );
  }

  if (activeModal.type === 'bulkChangeAccount' && workplaceId) {
    return (
      <BulkChangeJournalAccountModal
        visible
        workplaceId={workplaceId}
        journalIds={activeModal.journalIds}
        onClose={onCloseModal}
        onSelectAccount={onBulkChangeAccountSelect}
      />
    );
  }

  return null;
}
