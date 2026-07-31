import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { useRegisterModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { useCallback, useMemo } from 'react';

export type SplitModePanelProps = {
  splitEditor: SplitJournalController;
  isEdit: boolean;
  isSubmitting: boolean;
};

export function SplitModePanel({ splitEditor, isEdit, isSubmitting }: SplitModePanelProps) {
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
    }),
    [isEdit, isSubmitting, splitEditor.isSubmitting, isSplitValid, submit],
  );

  useRegisterModeHandle(handle);

  return <SplitForm {...splitEditor} />;
}
