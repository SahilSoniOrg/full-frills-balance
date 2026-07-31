import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { useRegisterModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import Account from '@/src/data/models/Account';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { useCallback, useMemo } from 'react';

export type SplitModePanelProps = {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  onSelectAccountRequest: (lineId: string) => void;
};

export function SplitModePanel({ accounts, editor, onSelectAccountRequest }: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest,
    isActive: true,
  });

  const applyAccount = useCallback(
    (lineId: string, accountId: AccountId) => {
      if (lineId === SPLIT_SOURCE_LINE_ID) {
        splitEditor.setSourceAccountId(accountId);
      } else {
        splitEditor.updateSplitRow(lineId, { accountId });
      }
    },
    [splitEditor],
  );

  const resolveSelectedAccountId = useCallback(
    (activeLineId: string) => {
      if (activeLineId === SPLIT_SOURCE_LINE_ID) {
        return splitEditor.sourceAccountId !== EMPTY_ACCOUNT_ID
          ? splitEditor.sourceAccountId
          : undefined;
      }
      return splitEditor.splits.find(s => s.id === activeLineId)?.accountId;
    },
    [splitEditor.sourceAccountId, splitEditor.splits],
  );

  const isSplitValid = splitEditor.isValid && !splitEditor.isSubmitting;

  const submit = useCallback(() => {
    void splitEditor.handleSave();
  }, [splitEditor]);

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
        isEdit: editor.isEdit,
        isSubmitting: editor.isSubmitting,
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
      applyAccount,
      resolveSelectedAccountId,
    }),
    [
      editor.isEdit,
      editor.isSubmitting,
      splitEditor.isSubmitting,
      isSplitValid,
      submit,
      applyAccount,
      resolveSelectedAccountId,
    ],
  );

  useRegisterModeHandle(handle);

  return <SplitForm {...splitEditor} />;
}
