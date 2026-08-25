import { BulkEntryGrid } from '@/src/features/journal/entry/components/BulkEntryGrid';
import { BulkSaveSummaryModal } from '@/src/features/journal/entry/components/BulkSaveSummaryModal';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import type { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { AccountFields } from '@/src/types/plainDtos';

export type BatchModePanelProps = {
  editor: ReturnType<typeof useBulkJournalEditor>;
  accounts: AccountFields[];
  summary: { count: number; items: SavedJournalSummary[] } | null;
  onContinue: () => void;
  onDone: () => void;
};

export function BatchModePanel({
  editor,
  accounts,
  summary,
  onContinue,
  onDone,
}: BatchModePanelProps) {
  return (
    <>
      <BulkEntryGrid
        rows={editor.rows}
        submitError={editor.submitError}
        accounts={accounts}
        addRow={editor.addRow}
        removeRow={editor.removeRow}
        clearRows={editor.clearRows}
        updateRowField={editor.updateRowField}
      />
      <BulkSaveSummaryModal
        summary={summary}
        onClose={onContinue}
        onContinueBulk={onContinue}
        onDone={onDone}
      />
    </>
  );
}
