import { AccountId, EnrichedJournal, JournalId, WorkplaceId } from '@/src/types/domain';

export type JournalActiveModal =
  | { type: 'bulkRename'; journals: EnrichedJournal[] }
  | { type: 'merge'; journalIds: JournalId[] }
  | { type: 'bulkChangeAccount'; journalIds: JournalId[] }
  | null;

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
