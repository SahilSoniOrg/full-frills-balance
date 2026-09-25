import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AppIcon, AppInput, PressScaleTouchable, SwipeToRemove } from '@/src/components/core';
import { CompactAmountInput } from '@/src/components/forms/CompactAmountInput';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Size, Spacing, Typography } from '@/src/constants/design-tokens';
import type { SplitRowFx } from '@/src/features/journal/entry/modes/split/splitJournalState';
import type { SplitRowState } from '@/src/services/journal/splitJournalHelpers';
import type { AccountRole } from '@/src/types/domainJournal';
import { Icon, type IconName } from '@/src/types/domainIcons';
import type { AccountFields } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccountPickerField } from './AccountPickerField';
import { AttachedRowShell, ExchangeRateCard } from './ExchangeRateCard';

export interface SplitAllocationRowProps {
  allAccounts: AccountFields[];
  allocationAccounts: AccountFields[];
  canRemove: boolean;
  emptyPrompt: string;
  fx: SplitRowFx;
  isExpanded: boolean;
  label: string;
  /** Defaults to the split allocation row (a destination leg). */
  role?: AccountRole;
  /** Prefix for row test IDs. Defaults to the split row ids. */
  testIDPrefix?: string;
  onChangeAmount: (amount: string) => void;
  notes?: string;
  notesPlaceholder?: string;
  onChangeNotes?: (notes: string) => void;
  onConvertedAmountChange: (amount: string) => void;
  onCreateAccountRequest: (role: AccountRole, intent: CreateAccountIntent) => void;
  onRemove: () => void;
  onMove?: () => void;
  moveLabel?: string;
  moveIcon?: IconName;
  onResetToApiRate: () => void;
  onSelectAccount: (accountId: SplitRowState['accountId']) => void;
  onToggle: () => void;
  removeLabel: string;
  row: SplitRowState;
}

function formatAmountPlaceholder(precision: number): string {
  return precision > 0 ? `0.${'0'.repeat(precision)}` : '0';
}

export function SplitAllocationRow({
  allAccounts,
  allocationAccounts,
  canRemove,
  emptyPrompt,
  fx,
  isExpanded,
  label,
  role = 'destination',
  testIDPrefix = 'split',
  onChangeAmount,
  notes,
  notesPlaceholder,
  onChangeNotes,
  onConvertedAmountChange,
  onCreateAccountRequest,
  onRemove,
  onMove,
  moveLabel,
  moveIcon = Icon.ArrowDown,
  onResetToApiRate,
  onSelectAccount,
  onToggle,
  removeLabel,
  row,
}: SplitAllocationRowProps) {
  const { theme } = useTheme();
  const category = allocationAccounts.find(account => account.id === row.accountId);
  const { pair, inputAmount, inputCurrency, inputPrecision, rowPrecision } = fx;

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (canRemove && event.nativeEvent.actionName === 'delete') onRemove();
    },
    [canRemove, onRemove],
  );

  const showFxCard = pair.isCrossCurrency || pair.needsManualRates;
  const accountField = (
    <AccountPickerField
      account={category}
      accounts={allocationAccounts}
      allAccounts={allAccounts}
      containerStyle={styles.categoryPicker}
      displayMode="compact"
      emptyPrompt={emptyPrompt}
      isExpanded={isExpanded}
      label={label}
      onCreateAccountRequest={onCreateAccountRequest}
      onSelect={onSelectAccount}
      onToggle={onToggle}
      role={role}
      testIDPrefix={`${testIDPrefix}-category-picker-${row.id}`}
      trailing={
        <View style={styles.trailing}>
          <CompactAmountInput
            value={inputAmount}
            onChangeText={onChangeAmount}
            currency={inputCurrency}
            currencySymbol={CURRENCY_SYMBOLS[inputCurrency] || inputCurrency}
            precision={inputPrecision}
            placeholder={formatAmountPlaceholder(inputPrecision)}
            containerStyle={styles.amountInputContainer}
            inputStyle={[styles.amountInputText, { color: theme.text }]}
            testID={`${testIDPrefix}-amount-input-${row.id}`}
          />
          {onMove ? (
            <PressScaleTouchable
              onPress={onMove}
              accessibilityRole="button"
              accessibilityLabel={moveLabel}
              style={styles.moveButton}
              testID={`${testIDPrefix}-move-${row.id}`}
            >
              <AppIcon name={moveIcon} size={Size.iconXs} color={theme.textSecondary} />
            </PressScaleTouchable>
          ) : null}
        </View>
      }
    />
  );

  const notesField = onChangeNotes ? (
    <AppInput
      value={notes ?? ''}
      onChangeText={onChangeNotes}
      placeholder={notesPlaceholder}
      variant="minimal"
      containerStyle={styles.notes}
      inputStyle={styles.notesInput}
      testID={`${testIDPrefix}-notes-${row.id}`}
    />
  ) : null;
  const rowBody = (
    <>
      {accountField}
      {notesField}
    </>
  );

  const content = (
    <View
      testID={`${testIDPrefix}-allocation-row-${row.id}`}
      accessibilityActions={canRemove ? [{ name: 'delete', label: removeLabel }] : undefined}
      onAccessibilityAction={handleAccessibilityAction}
    >
      {showFxCard ? (
        <ExchangeRateCard
          variant="attached"
          pair={pair}
          precision={rowPrecision}
          onConvertedAmountChange={onConvertedAmountChange}
          onResetToApiRate={onResetToApiRate}
          testIDPrefix={`${testIDPrefix}-fx-${row.id}`}
        >
          {rowBody}
        </ExchangeRateCard>
      ) : notesField ? (
        <AttachedRowShell>{rowBody}</AttachedRowShell>
      ) : (
        accountField
      )}
    </View>
  );

  return canRemove ? (
    <SwipeToRemove label={removeLabel} borderRadius="lg" onRemove={onRemove}>
      {content}
    </SwipeToRemove>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  trailing: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  moveButton: {
    minWidth: Size.buttonSm,
    minHeight: Size.buttonSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPicker: {
    marginHorizontal: 0,
  },
  amountInputContainer: {
    flex: 1,
    minWidth: 0,
    width: 0,
    alignSelf: 'stretch',
  },
  notes: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  notesInput: {
    minHeight: 0,
    paddingVertical: 2,
    fontSize: Typography.sizes.sm,
  },
  amountInputText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    textAlign: 'right',
    paddingHorizontal: 0,
  },
});
