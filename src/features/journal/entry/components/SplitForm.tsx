import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppIcon, AppText, Icon } from '@/src/components/core';
import { CompactAmountInput } from '@/src/components/forms/CompactAmountInput';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import {
  amountInSourceCurrency,
  distributeSplitRemainder,
  equalizeSplitAmounts,
  SPLIT_SOURCE_LINE_ID,
} from '@/src/services/journal/splitJournalHelpers';
import type { AccountRole, TabType } from '@/src/types/domainJournal';
import type { AccountId } from '@/src/types/ids';
import { formatRoundedAmount } from '@/src/utils/money';
import { AccountPickerField } from '@/src/features/journal/entry/components/AccountPickerField';
import { SplitAllocationRow } from '@/src/features/journal/entry/components/SplitAllocationRow';
import { TransactionTypeSegmentedControl } from '@/src/features/journal/entry/components/TransactionTypeSegmentedControl';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { resolveSimpleTypeAccentColor } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type SplitFormProps = SplitJournalController & {
  onCreateAccountRequestForRow: (
    rowId: string,
    role: AccountRole,
    intent: CreateAccountIntent,
  ) => void;
};

function formatAmountPlaceholder(precision: number): string {
  return precision > 0 ? `0.${'0'.repeat(precision)}` : '0';
}

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
  addSplitRow,
  removeSplitRow,
  updateSplitRow,
  updateSplitAmounts,
  updateSplitInputAmount,
  updateSplitConvertedAmount,
  resetSplitRate,
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
  const [activePickerKey, setActivePickerKey] = useState<string | null>(null);
  const typeCopy = resolveSplitTypeCopy(transactionType);
  const currencyCode = displayCurrency.trim().toUpperCase() || 'USD';
  const currencySymbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  const hasTotal = totals.total > 0;
  // Split entries require at least one allocation. The controller also
  // enforces this invariant for non-UI callers.
  const canRemove = splits.length > 1;
  const isFullyAllocated = hasTotal && totals.remaining === 0;
  const isOverAllocated = totals.remaining < 0;
  const canDistribute = hasTotal && totals.remaining > 0;
  const formatRemainingAmount = useCallback(
    (amount: number) => `${currencySymbol} ${formatRoundedAmount(amount, precision)}`,
    [currencySymbol, precision],
  );
  const remainingLabel = !hasTotal
    ? strings.enterTotal
    : totals.remaining === 0
      ? strings.remainingZero
      : totals.remaining > 0
        ? strings.remainingPositive(formatRemainingAmount(totals.remaining))
        : strings.remainingNegative(formatRemainingAmount(Math.abs(totals.remaining)));
  const remainingColor = isOverAllocated
    ? theme.error
    : isFullyAllocated
      ? theme.primary
      : theme.textSecondary;
  const validationMessage = validationError ? strings.validation[validationError] : null;

  const applyAmounts = useCallback(
    (nextSplits: SplitJournalController['splits']) => {
      const updates: Record<string, string> = {};
      nextSplits.forEach(nextRow => {
        const currentRow = splits.find(row => row.id === nextRow.id);
        if (!currentRow || currentRow.amount === nextRow.amount) return;
        const fx = splitFx[nextRow.id];
        const nominal = Number.parseFloat(nextRow.amount);
        updates[nextRow.id] =
          fx?.pair.isCrossCurrency && fx.pair.pairRate && Number.isFinite(nominal)
            ? amountInSourceCurrency(nominal, fx.pair.pairRate, fx.inputPrecision)
            : nextRow.amount;
      });
      if (Object.keys(updates).length > 0) updateSplitAmounts(updates);
    },
    [splitFx, splits, updateSplitAmounts],
  );

  const handleEqualSplit = useCallback(() => {
    if (hasTotal) {
      applyAmounts(equalizeSplitAmounts(totalAmount, splits, precision, currencyContext));
    }
  }, [applyAmounts, currencyContext, hasTotal, precision, splits, totalAmount]);

  const handleDistribute = useCallback(() => {
    if (canDistribute) {
      applyAmounts(distributeSplitRemainder(totalAmount, splits, precision, currencyContext));
    }
  }, [applyAmounts, canDistribute, currencyContext, precision, splits, totalAmount]);

  const togglePicker = useCallback((key: string) => {
    setActivePickerKey(current => (current === key ? null : key));
  }, []);

  const handleSourceAccountSelect = useCallback(
    (accountId: AccountId) => {
      setSourceAccountId(accountId);
      setActivePickerKey(null);
    },
    [setSourceAccountId],
  );

  const handleCreateAccountRequest = useCallback(
    (rowId: string, role: AccountRole, intent: CreateAccountIntent) => {
      onCreateAccountRequestForRow(rowId, role, intent);
      setActivePickerKey(null);
    },
    [onCreateAccountRequestForRow],
  );

  const handleRemove = useCallback(
    (rowId: string) => {
      setActivePickerKey(current => (current === rowId ? null : current));
      removeSplitRow(rowId);
    },
    [removeSplitRow],
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
          isExpanded={activePickerKey === 'source'}
          label={typeCopy.sourceLabel}
          onCreateAccountRequest={(role, intent) =>
            handleCreateAccountRequest(SPLIT_SOURCE_LINE_ID, role, intent)
          }
          onSelect={handleSourceAccountSelect}
          onToggle={() => togglePicker('source')}
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
              containerStyle={styles.amountInputContainer}
              inputStyle={[styles.amountInputText, { color: theme.text }]}
              testID="split-total-amount-input"
            />
          }
        />
      </View>

      <View style={styles.allocationSection}>
        <View style={styles.sectionHeader}>
          <AppText variant="body" color="primary" weight="bold">
            {typeCopy.allocationTitle}
          </AppText>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleEqualSplit}
              disabled={!hasTotal}
              style={[styles.actionButton, { opacity: hasTotal ? 1 : 0.45 }]}
              accessibilityRole="button"
            >
              <AppText variant="caption" color="secondary" weight="semibold">
                {strings.equalSplit}
              </AppText>
            </TouchableOpacity>
            <View
              style={[
                styles.actionDivider,
                { backgroundColor: withOpacity(theme.border, Opacity.active) },
              ]}
            />
            <TouchableOpacity
              onPress={handleDistribute}
              disabled={!canDistribute}
              style={[styles.actionButton, { opacity: canDistribute ? 1 : 0.45 }]}
              accessibilityRole="button"
            >
              <AppText variant="caption" color="secondary" weight="semibold">
                {strings.distribute}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
        <AppText
          variant="caption"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.allocationStatus, { color: remainingColor }]}
        >
          {remainingLabel}
        </AppText>

        {splits.map(row => (
          <SplitAllocationRow
            key={row.id}
            allAccounts={allAccounts}
            allocationAccounts={allocationAccounts}
            canRemove={canRemove}
            emptyPrompt={typeCopy.allocationEmptyPrompt}
            fx={splitFx[row.id]}
            isExpanded={activePickerKey === row.id}
            label={typeCopy.allocationLabel}
            onCreateAccountRequest={(role, intent) =>
              handleCreateAccountRequest(row.id, role, intent)
            }
            onRemove={() => handleRemove(row.id)}
            onSelectAccount={accountId => {
              updateSplitRow(row.id, { accountId });
              setActivePickerKey(null);
            }}
            onToggle={() => togglePicker(row.id)}
            onChangeAmount={amount => updateSplitInputAmount(row.id, amount)}
            onConvertedAmountChange={amount => updateSplitConvertedAmount(row.id, amount)}
            onResetToApiRate={() => resetSplitRate(row.id)}
            removeLabel={strings.removeSplit}
            row={row}
          />
        ))}

        {validationMessage && hasTotal ? (
          <View style={[styles.error, { backgroundColor: withOpacity(theme.error, Opacity.soft) }]}>
            <AppIcon name={Icon.Error} size={Size.iconXs} color={theme.error} />
            <AppText variant="caption" color="error" weight="semibold" style={styles.errorText}>
              {validationMessage}
            </AppText>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={addSplitRow}
          style={[styles.addButton, { borderColor: withOpacity(theme.primary, Opacity.medium) }]}
          accessibilityRole="button"
          testID="split-add-row"
        >
          <AppIcon name={Icon.Plus} size={Size.iconXs} color={theme.primary} />
          <AppText variant="caption" color="primary" weight="semibold">
            {strings.addSplit}
          </AppText>
        </TouchableOpacity>
        {canRemove ? (
          <AppText variant="caption" color="tertiary" style={styles.swipeHint}>
            {strings.swipeToRemove}
          </AppText>
        ) : null}
      </View>
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
  amountInputContainer: {
    flex: 1,
    minWidth: 0,
    width: 0,
    alignSelf: 'stretch',
  },
  allocationSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  allocationStatus: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  actions: { flexDirection: 'row', gap: Spacing.xs },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    height: Spacing.md,
    alignSelf: 'center',
  },
  actionButton: {
    minHeight: Size.buttonSm,
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
  },
  amountInputText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    textAlign: 'right',
    paddingHorizontal: 0,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Shape.radius.r2,
  },
  errorText: { flex: 1 },
  addButton: {
    alignSelf: 'center',
    width: '42%',
    minHeight: Size.buttonSm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Shape.radius.full,
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  swipeHint: {
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
});
