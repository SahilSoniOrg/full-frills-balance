import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { EnrichedJournal } from '@/src/types/domainReadModels';

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
