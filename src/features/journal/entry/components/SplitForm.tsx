import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppText } from '@/src/components/core';
import { CompactAmountInput } from '@/src/components/forms/CompactAmountInput';
import { AppConfig, Spacing } from '@/src/constants';
import {
  AllocationActions,
  AllocationRows,
  AllocationSection,
  AllocationStatusText,
  useExclusivePicker,
} from '@/src/features/journal/entry/components/AllocationSection';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import {
  distributeSplitRemainder,
  equalizeSplitAmounts,
  SPLIT_SOURCE_LINE_ID,
} from '@/src/services/journal/splitJournalHelpers';
import type { AccountRole, TabType } from '@/src/types/domainJournal';
import type { AccountId } from '@/src/types/ids';
import { formatRoundedAmount } from '@/src/utils/money';
import { AccountPickerField } from '@/src/features/journal/entry/components/AccountPickerField';
import { EntryInlineError } from '@/src/features/journal/entry/components/EntryInlineError';
import {
  allocationAmountStyles,
  formatAmountPlaceholder,
} from '@/src/features/journal/entry/components/SplitAllocationRow';
import { TransactionTypeSegmentedControl } from '@/src/features/journal/entry/components/TransactionTypeSegmentedControl';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import {
  resolveAllocationStatus,
  resolveSimpleTypeAccentColor,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

type SplitFormProps = SplitJournalController & {
  onCreateAccountRequestForRow: (
    rowId: string,
    role: AccountRole,
    intent: CreateAccountIntent,
  ) => void;
};

function resolveSplitTypeCopy(type: TabType) {
  const simpleStrings = AppConfig.strings.transactionFlow.simpleEntry;
  const splitStrings = AppConfig.strings.transactionFlow.splitEntry;

  if (type === 'income') {
    return {
      sourceLabel: simpleStrings.fromSource,
      sourceEmptyPrompt: simpleStrings.chooseCategory,
      allocationTitle: simpleStrings.toAccount,
      allocationLabel: simpleStrings.toAccount,
      allocationEmptyPrompt: simpleStrings.chooseAccount,
      totalLabel: splitStrings.totalAmount,
    };
  }

  if (type === 'transfer') {
    return {
      sourceLabel: simpleStrings.sourceAccount,
      sourceEmptyPrompt: simpleStrings.chooseAccount,
      allocationTitle: simpleStrings.destinationAccount,
      allocationLabel: simpleStrings.destinationAccount,
      allocationEmptyPrompt: simpleStrings.chooseAccount,
      totalLabel: splitStrings.totalAmount,
    };
  }

  return {
    sourceLabel: splitStrings.fromAccount,
    sourceEmptyPrompt: simpleStrings.chooseAccount,
    allocationTitle: splitStrings.categoriesTitle,
    allocationLabel: splitStrings.category,
    allocationEmptyPrompt: splitStrings.chooseCategory,
    totalLabel: splitStrings.totalAmount,
  };
}

export function SplitForm({
  totalAmount,
  setTotalAmount,
  transactionType,
  setTransactionType,
  splits,
  splitFx,
  sourceFx,
  canEqualize,
  addSplitRow,
  removeSplitRow,
  updateSplitRow,
  updateSplitAmounts,
  updateAmount,
  updateConvertedAmount,
  resetRate,
  updateSourceConvertedAmount,
  resetSourceRate,
  totals,
  currencyContext,
  validationError,
  allAccounts,
  sourceAccounts,
  allocationAccounts,
  sourceAccount,
  setSourceAccountId,
  displayCurrency,
  precision,
  onCreateAccountRequestForRow,
}: SplitFormProps) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.transactionFlow.splitEntry;
  const { isExpanded, toggle, close, closeIf } = useExclusivePicker();
  const typeCopy = resolveSplitTypeCopy(transactionType);
  const currencyCode = displayCurrency.trim().toUpperCase() || 'USD';
  const currencySymbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  const hasTotal = totals.total > 0;
  // Split entries require at least one allocation. The controller also
  // enforces this invariant for non-UI callers.
  const canRemove = splits.length > 1;
  const canDistribute = canEqualize && totals.remaining > 0;
  const allocationStatus = resolveAllocationStatus({
    hasAmount: hasTotal,
    balanced: totals.remaining === 0,
    remaining: totals.remaining,
    formattedAmount: `${currencySymbol} ${formatRoundedAmount(Math.abs(totals.remaining), precision)}`,
    emptyLabel: strings.enterTotal,
  });
  const validationMessage = validationError ? strings.validation[validationError] : null;

  const applyAmounts = useCallback(
    (nextSplits: SplitJournalController['splits']) => {
      const updates: Record<string, string> = {};
      nextSplits.forEach(nextRow => {
        const currentRow = splits.find(row => row.id === nextRow.id);
        if (!currentRow || currentRow.amount === nextRow.amount) return;
        updates[nextRow.id] = nextRow.amount;
      });
      if (Object.keys(updates).length > 0) updateSplitAmounts(updates);
    },
    [splits, updateSplitAmounts],
  );

  const handleEqualSplit = useCallback(() => {
    if (!canEqualize) return;
    applyAmounts(equalizeSplitAmounts(totalAmount, splits, precision, currencyContext));
  }, [applyAmounts, canEqualize, currencyContext, precision, splits, totalAmount]);

  const handleDistribute = useCallback(() => {
    if (canDistribute) {
      applyAmounts(distributeSplitRemainder(totalAmount, splits, precision, currencyContext));
    }
  }, [applyAmounts, canDistribute, currencyContext, precision, splits, totalAmount]);

  const handleSourceAccountSelect = useCallback(
    (accountId: AccountId) => {
      setSourceAccountId(accountId);
      close();
    },
    [close, setSourceAccountId],
  );

  const handleCreateAccountRequest = useCallback(
    (rowId: string, role: AccountRole, intent: CreateAccountIntent) => {
      onCreateAccountRequestForRow(rowId, role, intent);
      close();
    },
    [close, onCreateAccountRequestForRow],
  );

  return (
    <View style={styles.container}>
      <TransactionTypeSegmentedControl
        value={transactionType}
        onChange={setTransactionType}
        accentColor={resolveSimpleTypeAccentColor(transactionType, theme)}
        variant="standard"
      />
      <View style={styles.sourceSection}>
        <AppText variant="body" color="primary" weight="bold" style={styles.sectionTitle}>
          {typeCopy.sourceLabel}
        </AppText>
        <AccountPickerField
          account={sourceAccount}
          accounts={sourceAccounts}
          allAccounts={allAccounts}
          containerStyle={styles.folderPicker}
          displayMode="compact"
          emptyPrompt={typeCopy.sourceEmptyPrompt}
          exchangeRate={{
            pair: sourceFx.pair,
            precision: sourceFx.rowPrecision,
            onConvertedAmountChange: updateSourceConvertedAmount,
            onResetToApiRate: resetSourceRate,
            testIDPrefix: 'split-source-fx',
          }}
          isExpanded={isExpanded('source')}
          label={typeCopy.sourceLabel}
          onCreateAccountRequest={(role, intent) =>
            handleCreateAccountRequest(SPLIT_SOURCE_LINE_ID, role, intent)
          }
          onSelect={handleSourceAccountSelect}
          onToggle={() => toggle('source')}
          role="source"
          testIDPrefix="split-source-picker"
          trailing={
            <CompactAmountInput
              value={totalAmount}
              onChangeText={setTotalAmount}
              currency={currencyCode}
              currencySymbol={currencySymbol}
              precision={precision}
              placeholder={formatAmountPlaceholder(precision)}
              containerStyle={allocationAmountStyles.container}
              inputStyle={[allocationAmountStyles.text, { color: theme.text }]}
              testID="split-total-amount-input"
            />
          }
        />
      </View>

      <AllocationSection
        title={typeCopy.allocationTitle}
        headerTrailing={
          <AllocationActions
            canEqualize={canEqualize}
            canDistribute={canDistribute}
            onEqualize={handleEqualSplit}
            onDistribute={handleDistribute}
          />
        }
        status={
          <AllocationStatusText
            label={allocationStatus.label}
            tone={allocationStatus.tone}
            style={styles.allocationStatus}
          />
        }
        footer={
          validationMessage && hasTotal ? <EntryInlineError message={validationMessage} /> : null
        }
        onAdd={addSplitRow}
        addLabel={strings.addSplit}
        addTestID="split-add-row"
        swipeHint={canRemove ? strings.swipeToRemove : null}
        style={styles.allocationSection}
      >
        <AllocationRows
          rows={splits.map(row => ({ ...row, fx: splitFx[row.id] }))}
          accounts={allAccounts}
          rowAccounts={allocationAccounts}
          canRemove={canRemove}
          emptyPrompt={typeCopy.allocationEmptyPrompt}
          label={typeCopy.allocationLabel}
          isExpanded={isExpanded}
          onToggle={toggle}
          onClose={close}
          onCloseIf={closeIf}
          onCreateAccount={onCreateAccountRequestForRow}
          onRemove={removeSplitRow}
          onSelectAccount={(id, accountId) => updateSplitRow(id, { accountId })}
          onChangeAmount={updateAmount}
          onConvertedAmountChange={updateConvertedAmount}
          onResetRate={resetRate}
          removeLabel={strings.removeSplit}
        />
      </AllocationSection>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: Spacing.xxl },
  sourceSection: {
    paddingTop: Spacing.md,
  },
  sectionTitle: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  folderPicker: { marginHorizontal: Spacing.md },
  allocationSection: {
    paddingBottom: Spacing.md,
  },
  allocationStatus: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
});
