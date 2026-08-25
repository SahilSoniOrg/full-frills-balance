import { useAccounts } from '@/src/components/account-selection';
import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { Page } from '@/src/design-system';
import { BulkEntryGrid } from '@/src/features/journal/entry/components/BulkEntryGrid';
import { BulkSaveSummaryModal } from '@/src/features/journal/entry/components/BulkSaveSummaryModal';
import { JournalEntryHeader } from '@/src/features/journal/entry/components/JournalEntryHeader';
import { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';

export function BulkJournalScreen() {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { accounts } = useAccounts(workplaceId);
  const [summary, setSummary] = useState<{
    count: number;
    items: SavedJournalSummary[];
  } | null>(null);
  const onSaveSuccess = useCallback((count: number, items: SavedJournalSummary[]) => {
    setSummary({ count, items });
  }, []);
  const editor = useBulkJournalEditor({
    workplaceId,
    workplaceCurrency,
    accounts,
    onSaveSuccess,
  });

  return (
    <Page
      keyboardAvoiding
      scrollable={false}
      header={<JournalEntryHeader title="Batch transactions" onClose={AppNavigation.back} />}
      footer={
        <SubmitFooter
          onPress={editor.saveAll}
          disabled={!editor.isValid || editor.isSubmitting}
          loading={editor.isSubmitting}
          label={`Post ${editor.rows.length} transactions`}
        />
      }
    >
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
        onClose={() => setSummary(null)}
        onContinueBulk={() => {
          setSummary(null);
          editor.clearRows();
        }}
        onDone={() => {
          setSummary(null);
          AppNavigation.back();
        }}
      />
    </Page>
  );
}
