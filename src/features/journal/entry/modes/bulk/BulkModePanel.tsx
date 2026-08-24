import { BulkEntryGrid } from '@/src/features/journal/entry/components/BulkEntryGrid';
import { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { useRegisterModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import type { AccountFields } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { MutableRefObject, useCallback, useEffect, useMemo } from 'react';

export type BulkModePanelProps = {
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  accounts: AccountFields[];
  onSaveSuccess: (count: number, summaries: SavedJournalSummary[]) => void;
  bulkActionsRef?: MutableRefObject<{ clearRows: () => void } | null>;
};

export function BulkModePanel({
  workplaceId,
  workplaceCurrency,
  accounts,
  onSaveSuccess,
  bulkActionsRef,
}: BulkModePanelProps) {
  const bulkEditor = useBulkJournalEditor({
    workplaceId,
    workplaceCurrency,
    accounts,
    onSaveSuccess,
  });

  useEffect(() => {
    if (!bulkActionsRef) return;
    bulkActionsRef.current = { clearRows: bulkEditor.clearRows };
    return () => {
      bulkActionsRef.current = null;
    };
  }, [bulkActionsRef, bulkEditor.clearRows]);

  const submit = useCallback(() => {
    bulkEditor.saveAll();
  }, [bulkEditor]);

  const handle = useMemo<ModeHandle>(
    () => ({
      submitLabel: resolveJournalEntrySubmitLabel({
        activeMode: 'bulk',
        bulkSubmitting: bulkEditor.isSubmitting,
        bulkRowCount: bulkEditor.rows.length,
        isAmountFocused: false,
        isSimpleValid: false,
        simpleSubmitting: false,
        simpleType: 'expense',
        isEdit: false,
        isSubmitting: false,
      }),
      isSubmitDisabled: isJournalEntrySubmitDisabled({
        activeMode: 'bulk',
        bulkSubmitting: bulkEditor.isSubmitting,
        bulkValid: bulkEditor.isValid,
        isAmountFocused: false,
        isSimpleValid: false,
        isAdvancedValid: false,
      }),
      submit,
      isSubmitting: bulkEditor.isSubmitting,
    }),
    [bulkEditor.isSubmitting, bulkEditor.rows.length, bulkEditor.isValid, submit],
  );

  useRegisterModeHandle(handle);

  return (
    <BulkEntryGrid
      rows={bulkEditor.rows}
      submitError={bulkEditor.submitError}
      accounts={accounts}
      addRow={bulkEditor.addRow}
      removeRow={bulkEditor.removeRow}
      clearRows={bulkEditor.clearRows}
      updateRowField={bulkEditor.updateRowField}
    />
  );
}
