import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import {
  isAdvancedJournalFormValid,
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import type { ComposerSubmitState } from '@/src/features/journal/entry/composerSubmitState';
import { Spacing } from '@/src/constants';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

export type AdvancedModePanelProps = {
  editor: ReturnType<typeof useJournalEditor>;
  workplaceCurrency: string;
  onSelectAccountRequest: (lineId: string) => void;
  isActive?: boolean;
  onSubmitStateChange: (state: ComposerSubmitState | null) => void;
};

export function AdvancedModePanel({
  editor,
  workplaceCurrency,
  onSelectAccountRequest,
  isActive = true,
  onSubmitStateChange,
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
    journalBaseCurrency,
    getLineBaseAmount,
  } = useAdvancedJournalSummary(editor.lines);

  const isAdvancedValid = isAdvancedJournalFormValid({
    isBalanced,
    description: editor.description,
    lines: editor.lines,
    isSubmitting: editor.isSubmitting,
  });

  const submitState = useMemo<ComposerSubmitState>(
    () => ({
      submitLabel: resolveJournalEntrySubmitLabel({
        activeMode: 'expert',
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
        activeMode: 'expert',
        bulkSubmitting: false,
        bulkValid: false,
        isAmountFocused: false,
        isSimpleValid: false,
        isAdvancedValid,
      }),
      isSubmitting: editor.isSubmitting,
    }),
    [editor.isEdit, editor.isSubmitting, isAdvancedValid],
  );

  useEffect(() => {
    if (!isActive) return;
    onSubmitStateChange(submitState);
    return () => onSubmitStateChange(null);
  }, [isActive, onSubmitStateChange, submitState]);

  return (
    <View style={{ paddingHorizontal: Spacing.lg }}>
      <AdvancedForm
        editor={editor}
        workplaceCurrency={workplaceCurrency}
        journalBaseCurrency={journalBaseCurrency}
        getLineBaseAmount={getLineBaseAmount}
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
