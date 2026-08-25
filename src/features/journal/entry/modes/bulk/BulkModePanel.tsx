import { BulkEntryGrid } from '@/src/features/journal/entry/components/BulkEntryGrid';
import { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import type { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import type { AccountFields } from '@/src/types/plainDtos';
import { MutableRefObject, useCallback, useEffect, useMemo } from 'react';

export type BulkModePanelProps = {
  accounts: AccountFields[];
  bulkEditor: ReturnType<typeof useBulkJournalEditor>;
  bulkActionsRef?: MutableRefObject<{ clearRows: () => void } | null>;
  isActive?: boolean;
  onModeHandleChange: (handle: ModeHandle | null) => void;
};

export function BulkModePanel({
  accounts,
  bulkEditor,
  bulkActionsRef,
  isActive = true,
  onModeHandleChange,
}: BulkModePanelProps) {
  useEffect(() => {
    if (!bulkActionsRef) return;
    if (!isActive) {
      bulkActionsRef.current = null;
      return;
    }
    bulkActionsRef.current = { clearRows: bulkEditor.clearRows };
    return () => {
      bulkActionsRef.current = null;
    };
  }, [bulkActionsRef, bulkEditor.clearRows, isActive]);

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

  useEffect(() => {
    if (!isActive) return;
    onModeHandleChange(handle);
    return () => onModeHandleChange(null);
  }, [handle, isActive, onModeHandleChange]);

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
