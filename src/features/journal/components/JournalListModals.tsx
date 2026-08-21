import { BulkChangeJournalAccountModal } from '@/src/features/journal/components/modals/BulkChangeJournalAccountModal';
import { BulkRenameJournalsModal } from '@/src/features/journal/components/modals/BulkRenameJournalsModal';
import { MergeJournalsModal } from '@/src/features/journal/components/modals/MergeJournalsModal';
import type {
  JournalActiveModal,
  JournalListModalsProps,
} from '@/src/features/journal/types/modals';

export type { JournalActiveModal, JournalListModalsProps };

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
