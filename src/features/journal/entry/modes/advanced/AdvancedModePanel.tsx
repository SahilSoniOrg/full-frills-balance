import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import {
  isAdvancedJournalFormValid,
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { useRegisterModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import { Spacing } from '@/src/constants';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

export type AdvancedModePanelProps = {
  editor: ReturnType<typeof useJournalEditor>;
  workplaceCurrency: string;
  onSelectAccountRequest: (lineId: string) => void;
};

export function AdvancedModePanel({
  editor,
  workplaceCurrency,
  onSelectAccountRequest,
}: AdvancedModePanelProps) {
  const {
    totalDebits,
    totalCredits,
    isBalanced,
    isBalancedDisplay,
    imbalance,
    availableCurrencies,
    selectedCurrency,
    setSelectedCurrency,
  } = useAdvancedJournalSummary(editor.lines);

  const isAdvancedValid = isAdvancedJournalFormValid({
    isBalanced,
    description: editor.description,
    lines: editor.lines,
    isSubmitting: editor.isSubmitting,
  });

  const submit = useCallback(() => {
    editor.submit();
  }, [editor]);

  const handle = useMemo<ModeHandle>(
    () => ({
      submitLabel: resolveJournalEntrySubmitLabel({
        activeMode: 'advanced',
        bulkSubmitting: false,
        bulkRowCount: 0,
        isAmountFocused: false,
        isSimpleValid: false,
        simpleSubmitting: false,
        simpleType: 'expense',
        isEdit: editor.isEdit,
        isSubmitting: editor.isSubmitting,
      }),
      isSubmitDisabled: isJournalEntrySubmitDisabled({
        activeMode: 'advanced',
        bulkSubmitting: false,
        bulkValid: false,
        isAmountFocused: false,
        isSimpleValid: false,
        isAdvancedValid,
      }),
      submit,
      isSubmitting: editor.isSubmitting,
    }),
    [editor.isEdit, editor.isSubmitting, isAdvancedValid, submit],
  );

  useRegisterModeHandle(handle);

  return (
    <View style={{ paddingHorizontal: Spacing.lg }}>
      <AdvancedForm
        editor={editor}
        workplaceCurrency={workplaceCurrency}
        onSelectAccountRequest={onSelectAccountRequest}
      />
      <JournalSummary
        totalDebits={totalDebits}
        totalCredits={totalCredits}
        isBalanced={isBalanced}
        isBalancedDisplay={isBalancedDisplay}
        baseImbalance={imbalance}
        availableCurrencies={availableCurrencies}
        selectedCurrency={selectedCurrency}
        onSelectCurrency={setSelectedCurrency}
        workplaceCurrency={workplaceCurrency}
      />
    </View>
  );
}
