import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { Spacing } from '@/src/constants';
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
    journalBaseCurrency,
    getLineBaseAmount,
  } = useAdvancedJournalSummary(editor.lines);

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
