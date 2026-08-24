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
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId } from '@/src/types/ids';

export type AdvancedModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceCurrency: string;
  onSelectAccountRequest: (lineId: string) => void;
};

export function AdvancedModePanel({
  accounts,
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

  const isAdvancedValid = isAdvancedJournalFormValid({
    isBalanced,
    description: editor.description,
    lines: editor.lines,
    isSubmitting: editor.isSubmitting,
  });

  const submit = useCallback(() => {
    editor.submit();
  }, [editor]);

  const applyAccountToLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      const account = accounts.find(candidate => candidate.id === accountId);
      if (!account) return;
      editor.updateLine(lineId, {
        accountId,
        accountName: account.name,
        accountType: account.accountType,
        accountCurrency: account.currencyCode,
      });
    },
    [accounts, editor],
  );

  const resolveSelectedAccountId = useCallback(
    (lineId: string) => editor.lines.find(line => line.id === lineId)?.accountId,
    [editor.lines],
  );

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
      applyAccountToLine,
      resolveSelectedAccountId,
    }),
    [
      editor.isEdit,
      editor.isSubmitting,
      isAdvancedValid,
      submit,
      applyAccountToLine,
      resolveSelectedAccountId,
    ],
  );

  useRegisterModeHandle(handle);

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
