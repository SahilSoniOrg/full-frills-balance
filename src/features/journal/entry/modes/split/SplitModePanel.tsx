import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import type { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSplitEntryState } from '@/src/features/journal/entry/hooks/useSplitEntryState';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { useCallback, useEffect, useMemo } from 'react';

export type SplitModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  splitDraft: ReturnType<typeof useSplitEntryState>;
  onSelectAccountRequest: (lineId: string) => void;
  isEdit: boolean;
  isSubmitting: boolean;
  isActive?: boolean;
  onModeHandleChange: (handle: ModeHandle | null) => void;
};

export function SplitModePanel({
  accounts,
  editor,
  splitDraft,
  onSelectAccountRequest,
  isEdit,
  isSubmitting,
  isActive = true,
  onModeHandleChange,
}: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    editor,
    splitDraft,
    onSelectAccountRequest,
    isActive,
  });
  const isSplitValid = splitEditor.isValid && !splitEditor.isSubmitting;

  const { setSourceAccountId, updateSplitRow, handleSave } = splitEditor;

  const applyAccountToLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      if (lineId === SPLIT_SOURCE_LINE_ID) {
        setSourceAccountId(accountId);
      } else {
        updateSplitRow(lineId, { accountId });
      }
    },
    [setSourceAccountId, updateSplitRow],
  );

  const resolveSelectedAccountId = useCallback(
    (lineId: string) => {
      if (lineId === SPLIT_SOURCE_LINE_ID) {
        return splitEditor.sourceAccountId !== EMPTY_ACCOUNT_ID
          ? splitEditor.sourceAccountId
          : undefined;
      }
      return splitEditor.splits.find(row => row.id === lineId)?.accountId;
    },
    [splitEditor.sourceAccountId, splitEditor.splits],
  );

  const submit = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const handle = useMemo<ModeHandle>(
    () => ({
      submitLabel: resolveJournalEntrySubmitLabel({
        activeMode: 'split',
        bulkSubmitting: false,
        bulkRowCount: 0,
        isAmountFocused: false,
        isSimpleValid: false,
        simpleSubmitting: false,
        simpleType: 'expense',
        isEdit,
        isSubmitting,
        splitSubmitting: splitEditor.isSubmitting,
      }),
      isSubmitDisabled: isJournalEntrySubmitDisabled({
        activeMode: 'split',
        bulkSubmitting: false,
        bulkValid: false,
        isAmountFocused: false,
        isSimpleValid: false,
        isAdvancedValid: false,
        isSplitValid,
      }),
      submit,
      isSubmitting: splitEditor.isSubmitting,
      applyAccountToLine,
      resolveSelectedAccountId,
    }),
    [
      isEdit,
      isSubmitting,
      splitEditor.isSubmitting,
      isSplitValid,
      submit,
      applyAccountToLine,
      resolveSelectedAccountId,
    ],
  );

  useEffect(() => {
    if (!isActive) return;
    onModeHandleChange(handle);
    return () => onModeHandleChange(null);
  }, [handle, isActive, onModeHandleChange]);

  return <SplitForm {...splitEditor} />;
}
