import { BulkEntryGrid } from '@/src/features/journal/entry/components/BulkEntryGrid';
import { BulkSaveSummaryModal } from '@/src/features/journal/entry/components/BulkSaveSummaryModal';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import type { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountRole } from '@/src/types/domainJournal';
import type { CreateAccountIntent } from '@/src/components/account-selection';
import type { WorkplaceId } from '@/src/types/ids';

export type BatchModePanelProps = {
  editor: ReturnType<typeof useBulkJournalEditor>;
  accounts: AccountFields[];
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
  summary: { count: number; items: SavedJournalSummary[] } | null;
  onContinue: () => void;
  onDone: () => void;
  onCreateAccountRequestForRow: (
    rowId: string,
    role: AccountRole,
    intent: CreateAccountIntent,
  ) => void;
};

export function BatchModePanel({
  editor,
  accounts,
  workplaceCurrency,
  workplaceId,
  summary,
  onContinue,
  onDone,
  onCreateAccountRequestForRow,
}: BatchModePanelProps) {
  return (
    <>
      <BulkEntryGrid
        rows={editor.rows}
        submitError={editor.submitError}
        accounts={accounts}
        workplaceCurrency={workplaceCurrency}
        workplaceId={workplaceId}
        addRow={editor.addRow}
        removeRow={editor.removeRow}
        clearRows={editor.clearRows}
        rowActions={editor.rowActions}
        swapRowAccounts={editor.swapRowAccounts}
        refreshRowRate={editor.refreshRowRate}
        onCreateAccountRequest={onCreateAccountRequestForRow}
        isAtMaxRows={editor.isAtMaxRows}
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
