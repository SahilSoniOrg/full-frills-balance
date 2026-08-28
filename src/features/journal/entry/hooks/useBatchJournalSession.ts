import { useCallback, useState } from 'react';
import type { AccountFields } from '@/src/types/plainDtos';
import type { WorkplaceId } from '@/src/types/ids';
import type { SavedJournalSummary } from '../types/bulkJournal';
import { useBulkJournalEditor } from './useBulkJournalEditor';
import type { JournalEntryScreenMode } from '../journalEntryPresentation';

export function useBatchJournalSession(
  workplaceId: WorkplaceId,
  workplaceCurrency: string,
  accounts: AccountFields[],
  onToggleMode: (mode: JournalEntryScreenMode) => void,
) {
  const [batchSummary, setBatchSummary] = useState<{
    count: number;
    items: SavedJournalSummary[];
  } | null>(null);
  const onBatchSaveSuccess = useCallback(
    (count: number, items: SavedJournalSummary[]) => setBatchSummary({ count, items }),
    [],
  );
  const batchEditor = useBulkJournalEditor({
    workplaceId,
    workplaceCurrency,
    accounts,
    onSaveSuccess: onBatchSaveSuccess,
  });
  const { clearRows } = batchEditor;
  const onContinueBatch = useCallback(() => {
    setBatchSummary(null);
    clearRows();
  }, [clearRows]);
  const onDoneBatch = useCallback(() => {
    setBatchSummary(null);
    clearRows();
    onToggleMode('basic');
  }, [clearRows, onToggleMode]);
  return { batchEditor, batchSummary, onContinueBatch, onDoneBatch };
}
