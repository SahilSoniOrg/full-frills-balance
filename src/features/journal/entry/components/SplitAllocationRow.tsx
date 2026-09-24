import type { CreateAccountIntent } from '@/src/components/account-selection';
import { SwipeToRemove } from '@/src/components/core';
import { CompactAmountInput } from '@/src/components/forms/CompactAmountInput';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Typography } from '@/src/constants/design-tokens';
import type { SplitRowFx } from '@/src/features/journal/entry/modes/split/splitJournalState';
import type { SplitRowState } from '@/src/services/journal/splitJournalHelpers';
import type { AccountRole } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccountPickerField } from './AccountPickerField';
import { ExchangeRateCard } from './ExchangeRateCard';

export interface SplitAllocationRowProps {
  allAccounts: AccountFields[];
  allocationAccounts: AccountFields[];
  canRemove: boolean;
  emptyPrompt: string;
  fx: SplitRowFx;
  isExpanded: boolean;
  label: string;
  onChangeAmount: (amount: string) => void;
  onConvertedAmountChange: (amount: string) => void;
  onCreateAccountRequest: (role: AccountRole, intent: CreateAccountIntent) => void;
  onRemove: () => void;
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
  onChangeAmount,
  onConvertedAmountChange,
  onCreateAccountRequest,
  onRemove,
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

  const content = (
    <View
      style={[
        styles.rowGroup,
        pair.isCrossCurrency && styles.fxRowGroup,
        { borderTopColor: theme.border },
      ]}
      testID={`split-allocation-row-${row.id}`}
      accessibilityActions={canRemove ? [{ name: 'delete', label: removeLabel }] : undefined}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <ExchangeRateCard
        variant="attached"
        pair={pair}
        precision={rowPrecision}
        onConvertedAmountChange={onConvertedAmountChange}
        onResetToApiRate={onResetToApiRate}
        testIDPrefix={`split-fx-${row.id}`}
      />
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
        role="destination"
        testIDPrefix={`split-category-picker-${row.id}`}
        trailing={
          <CompactAmountInput
            value={inputAmount}
            onChangeText={onChangeAmount}
            currency={inputCurrency}
            currencySymbol={CURRENCY_SYMBOLS[inputCurrency] || inputCurrency}
            precision={inputPrecision}
            placeholder={formatAmountPlaceholder(inputPrecision)}
            containerStyle={styles.amountInputContainer}
            inputStyle={[styles.amountInputText, { color: theme.text }]}
            testID={`split-amount-input-${row.id}`}
          />
        }
      />
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
  rowGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fxRowGroup: {
    borderTopWidth: 0,
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
  amountInputText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    textAlign: 'right',
    paddingHorizontal: 0,
  },
});
