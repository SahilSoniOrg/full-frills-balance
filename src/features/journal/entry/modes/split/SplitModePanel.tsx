import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { useRegisterModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import Account from '@/src/data/models/Account';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { useCallback, useMemo } from 'react';

export type SplitModePanelProps = {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  onSelectAccountRequest: (lineId: string) => void;
  isEdit: boolean;
  isSubmitting: boolean;
};

export function SplitModePanel({
  accounts,
  editor,
  onSelectAccountRequest,
  isEdit,
  isSubmitting,
}: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest,
    isActive: true,
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

  useRegisterModeHandle(handle);

  return <SplitForm {...splitEditor} />;
}
