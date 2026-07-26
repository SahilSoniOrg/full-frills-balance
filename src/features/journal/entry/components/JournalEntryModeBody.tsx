import { Spacing } from '@/src/constants';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { JournalSummary } from '@/src/features/journal/entry/components/JournalSummary';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { BulkEntryGrid } from '@/src/features/journal/entry/components/BulkEntryGrid';
import Account from '@/src/data/models/Account';
import { View } from 'react-native';

export type JournalEntryModeBodyProps = {
  activeMode: JournalEntryScreenMode;
  simpleEditor: ReturnType<typeof useSimpleJournalEditor>;
  splitEditor: ReturnType<typeof useSplitJournalEditor>;
  bulkEditor: ReturnType<typeof useBulkJournalEditor>;
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceCurrency: string;
  onSelectAccountRequest: (lineId: string) => void;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  isBalancedDisplay: boolean;
  baseImbalance: number;
  availableCurrencies: string[];
  selectedCurrency: string;
  onSelectCurrency: (currency: string) => void;
};

export function JournalEntryModeBody({
  activeMode,
  simpleEditor,
  splitEditor,
  bulkEditor,
  accounts,
  editor,
  workplaceCurrency,
  onSelectAccountRequest,
  totalDebits,
  totalCredits,
  isBalanced,
  isBalancedDisplay,
  baseImbalance,
  availableCurrencies,
  selectedCurrency,
  onSelectCurrency,
}: JournalEntryModeBodyProps) {
  if (activeMode === 'guided') {
    return <SimpleForm {...simpleEditor} />;
  }

  if (activeMode === 'split') {
    return <SplitForm {...splitEditor} />;
  }

  if (activeMode === 'advanced') {
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
          baseImbalance={baseImbalance}
          availableCurrencies={availableCurrencies}
          selectedCurrency={selectedCurrency}
          onSelectCurrency={onSelectCurrency}
          workplaceCurrency={workplaceCurrency}
        />
      </View>
    );
  }

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
