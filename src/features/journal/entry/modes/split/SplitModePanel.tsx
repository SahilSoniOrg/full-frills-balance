import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import type { ComposerSubmitState } from '@/src/features/journal/entry/composerSubmitState';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSplitEntryState } from '@/src/features/journal/entry/hooks/useSplitEntryState';
import { useEffect, useMemo } from 'react';

export type SplitModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  splitDraft: ReturnType<typeof useSplitEntryState>;
  onSelectAccountRequest: (lineId: string) => void;
  isEdit: boolean;
  isSubmitting: boolean;
  isActive?: boolean;
  onSubmitStateChange: (state: ComposerSubmitState | null) => void;
};

export function SplitModePanel({
  accounts,
  editor,
  splitDraft,
  onSelectAccountRequest,
  isEdit,
  isSubmitting,
  isActive = true,
  onSubmitStateChange,
}: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    editor,
    splitDraft,
    onSelectAccountRequest,
    isActive,
  });
  const isSplitValid = splitEditor.isValid && !splitEditor.isSubmitting;

  const submitState = useMemo<ComposerSubmitState>(
    () => ({
      submitLabel: resolveJournalEntrySubmitLabel({
        activeMode: 'allocation',
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
        activeMode: 'allocation',
        bulkSubmitting: false,
        bulkValid: false,
        isAmountFocused: false,
        isSimpleValid: false,
        isAdvancedValid: false,
        isSplitValid,
      }),
      isSubmitting: splitEditor.isSubmitting,
    }),
    [isEdit, isSubmitting, splitEditor.isSubmitting, isSplitValid],
  );

  useEffect(() => {
    if (!isActive) return;
    onSubmitStateChange(submitState);
    return () => onSubmitStateChange(null);
  }, [isActive, onSubmitStateChange, submitState]);

  return <SplitForm {...splitEditor} />;
}
