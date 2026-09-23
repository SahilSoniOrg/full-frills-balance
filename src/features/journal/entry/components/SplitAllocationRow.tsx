import type { CreateAccountIntent } from '@/src/components/account-selection';
import { SwipeToRemove } from '@/src/components/core';
import { CompactAmountInput } from '@/src/components/forms/CompactAmountInput';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Spacing, Typography } from '@/src/constants/design-tokens';
import { useCrossCurrencyRates } from '@/src/features/journal/entry/hooks/useCrossCurrencyRates';
import {
  formatManualBaseRate,
  resolveWorkplaceRatesFromConvertedAmount,
} from '@/src/features/journal/entry/manualBaseRate';
import {
  getSplitCurrencyPrecision,
  type SplitRowState,
} from '@/src/services/journal/splitJournalHelpers';
import type { AccountRole } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccountPickerField } from './AccountPickerField';
import { SplitExchangeRateCard } from './SplitExchangeRateCard';

export interface SplitAllocationRowProps {
  allAccounts: AccountFields[];
  allocationAccounts: AccountFields[];
  canRemove: boolean;
  currencyCode: string;
  fallbackPrecision: number;
  emptyPrompt: string;
  isEditing?: boolean;
  isExpanded: boolean;
  label: string;
  journalDate?: string;
  onCreateAccountRequest: (role: AccountRole, intent: CreateAccountIntent) => void;
  onRemove: () => void;
  onSelectAccount: (accountId: SplitRowState['accountId']) => void;
  onToggle: () => void;
  onUpdateAmount: (amount: string) => void;
  onUpdateFxLine: (patch: { amount: string; exchangeRate: string }) => void;
  onUpdateSourceExchangeRate: (exchangeRate: string) => void;
  removeLabel: string;
  row: SplitRowState;
  sourceCurrency?: string;
  sourceExchangeRate?: string | number;
  workplaceCurrency: string;
}

function formatAmount(amount: number, precision: number): string {
  return amount.toFixed(precision);
}

function positiveRate(value: string | number | undefined): number | null {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function formatAmountPlaceholder(precision: number): string {
  return precision > 0 ? `0.${'0'.repeat(precision)}` : '0';
}

export function SplitAllocationRow({
  allAccounts,
  allocationAccounts,
  canRemove,
  currencyCode,
  fallbackPrecision,
  emptyPrompt,
  isEditing = false,
  isExpanded,
  label,
  journalDate,
  onCreateAccountRequest,
  onRemove,
  onSelectAccount,
  onToggle,
  onUpdateAmount,
  onUpdateFxLine,
  onUpdateSourceExchangeRate,
  removeLabel,
  row,
  sourceCurrency,
  sourceExchangeRate,
  workplaceCurrency,
}: SplitAllocationRowProps) {
  const { theme } = useTheme();
  const category = allocationAccounts.find(account => account.id === row.accountId);
  const rowCurrencyCode = (category?.currencyCode || row.accountCurrency || currencyCode)
    .trim()
    .toUpperCase();
  const normalizedSourceCurrency = sourceCurrency?.trim().toUpperCase();
  const isCrossCurrency = Boolean(
    normalizedSourceCurrency && rowCurrencyCode && normalizedSourceCurrency !== rowCurrencyCode,
  );
  const rowPrecision = row.precision ?? fallbackPrecision;
  const sourcePrecision = normalizedSourceCurrency
    ? getSplitCurrencyPrecision(normalizedSourceCurrency, fallbackPrecision)
    : fallbackPrecision;
  const [manualSourceBaseRate, setManualSourceBaseRate] = useState('');
  const [manualDestBaseRate, setManualDestBaseRate] = useState('');
  const [rateRefreshNonce, setRateRefreshNonce] = useState(0);
  const [pendingBaseAmount, setPendingBaseAmount] = useState<string | null>(null);
  const previousPairRef = useRef('');
  const consumedPendingBaseAmountRef = useRef<string | null>(null);

  const needsWorkplaceRate = Boolean(
    isCrossCurrency &&
    normalizedSourceCurrency &&
    (normalizedSourceCurrency !== workplaceCurrency || rowCurrencyCode !== workplaceCurrency),
  );
  const rates = useCrossCurrencyRates({
    sourceCurrency: normalizedSourceCurrency,
    destCurrency: rowCurrencyCode,
    workplaceCurrency,
    manualSourceBaseRate,
    manualDestBaseRate,
    journalDate,
    refreshNonce: rateRefreshNonce,
    enabled: needsWorkplaceRate && (!isEditing || rateRefreshNonce > 0),
  });

  const pairKey = `${normalizedSourceCurrency ?? ''}|${rowCurrencyCode}|${workplaceCurrency}`;
  useEffect(() => {
    if (previousPairRef.current === pairKey) return;
    previousPairRef.current = pairKey;
    consumedPendingBaseAmountRef.current = null;
    setManualSourceBaseRate('');
    setManualDestBaseRate('');
    setPendingBaseAmount(isCrossCurrency && !positiveRate(row.exchangeRate) ? row.amount : null);
  }, [isCrossCurrency, pairKey, row.amount, row.exchangeRate]);

  const effectiveWorkplaceRates = useMemo(() => {
    const sourceRate =
      normalizedSourceCurrency === workplaceCurrency
        ? 1
        : (positiveRate(sourceExchangeRate) ?? rates.sourceBaseRate);
    const destinationRate =
      rowCurrencyCode === workplaceCurrency
        ? 1
        : (positiveRate(row.exchangeRate) ?? rates.destBaseRate);
    return { sourceRate, destinationRate };
  }, [
    normalizedSourceCurrency,
    rates.destBaseRate,
    rates.sourceBaseRate,
    row.exchangeRate,
    rowCurrencyCode,
    sourceExchangeRate,
    workplaceCurrency,
  ]);

  useEffect(() => {
    if (
      !isCrossCurrency ||
      normalizedSourceCurrency === workplaceCurrency ||
      positiveRate(sourceExchangeRate) ||
      !effectiveWorkplaceRates.sourceRate
    )
      return;

    onUpdateSourceExchangeRate(formatManualBaseRate(effectiveWorkplaceRates.sourceRate));
  }, [
    effectiveWorkplaceRates.sourceRate,
    isCrossCurrency,
    normalizedSourceCurrency,
    onUpdateSourceExchangeRate,
    sourceExchangeRate,
    workplaceCurrency,
  ]);

  const pairRate = useMemo(() => {
    if (!isCrossCurrency) return null;
    if (
      rates.exchangeRate &&
      rates.exchangeRate > 0 &&
      (manualSourceBaseRate || manualDestBaseRate)
    ) {
      return rates.exchangeRate;
    }
    if (effectiveWorkplaceRates.sourceRate && effectiveWorkplaceRates.destinationRate) {
      return effectiveWorkplaceRates.sourceRate / effectiveWorkplaceRates.destinationRate;
    }
    return rates.exchangeRate && rates.exchangeRate > 0 ? rates.exchangeRate : null;
  }, [
    effectiveWorkplaceRates,
    isCrossCurrency,
    manualDestBaseRate,
    manualSourceBaseRate,
    rates.exchangeRate,
  ]);

  const effectivePendingBaseAmount = useMemo(() => {
    if (pendingBaseAmount === null) return null;
    if (positiveRate(row.exchangeRate)) return null;

    const pending = Number.parseFloat(pendingBaseAmount);
    const rowAmount = Number.parseFloat(row.amount);
    if (!positiveRate(row.exchangeRate) && Number.isFinite(rowAmount) && rowAmount !== pending) {
      return row.amount;
    }

    return pendingBaseAmount;
  }, [pendingBaseAmount, row.amount, row.exchangeRate]);

  const baseAmount = useMemo(() => {
    if (!isCrossCurrency) return row.amount;
    if (effectivePendingBaseAmount !== null) return effectivePendingBaseAmount;
    const nominalAmount = Number.parseFloat(row.amount);
    return pairRate && Number.isFinite(nominalAmount)
      ? formatAmount(nominalAmount / pairRate, sourcePrecision)
      : row.amount;
  }, [effectivePendingBaseAmount, isCrossCurrency, pairRate, row.amount, sourcePrecision]);

  const convertedAmount = useMemo(() => {
    if (!isCrossCurrency || !pairRate) return '';
    const base = Number.parseFloat(baseAmount);
    return Number.isFinite(base) && base > 0 ? formatAmount(base * pairRate, rowPrecision) : '';
  }, [baseAmount, isCrossCurrency, pairRate, rowPrecision]);

  const persistRates = useCallback(
    (nextAmount: number, sourceRate: number | null, destinationRate: number | null) => {
      onUpdateFxLine({
        amount: formatAmount(nextAmount, rowPrecision),
        exchangeRate:
          rowCurrencyCode === workplaceCurrency && destinationRate === 1
            ? ''
            : destinationRate
              ? formatManualBaseRate(destinationRate)
              : '',
      });
      if (normalizedSourceCurrency !== workplaceCurrency && sourceRate) {
        onUpdateSourceExchangeRate(formatManualBaseRate(sourceRate));
      }
    },
    [
      normalizedSourceCurrency,
      onUpdateFxLine,
      onUpdateSourceExchangeRate,
      rowCurrencyCode,
      rowPrecision,
      workplaceCurrency,
    ],
  );

  useEffect(() => {
    if (
      !isCrossCurrency ||
      pendingBaseAmount === null ||
      positiveRate(row.exchangeRate) ||
      !pairRate
    )
      return;
    if (consumedPendingBaseAmountRef.current === effectivePendingBaseAmount) return;
    const base = Number.parseFloat(effectivePendingBaseAmount ?? pendingBaseAmount);
    if (!(base > 0) || !effectiveWorkplaceRates.destinationRate) return;

    consumedPendingBaseAmountRef.current = effectivePendingBaseAmount;
    persistRates(
      base * pairRate,
      effectiveWorkplaceRates.sourceRate,
      effectiveWorkplaceRates.destinationRate,
    );
  }, [
    effectivePendingBaseAmount,
    effectiveWorkplaceRates,
    isCrossCurrency,
    pairRate,
    pendingBaseAmount,
    persistRates,
    row.exchangeRate,
  ]);

  const handleBaseAmountChange = useCallback(
    (value: string) => {
      if (!isCrossCurrency) {
        onUpdateAmount(value);
        return;
      }

      const base = Number.parseFloat(value);
      if (!(base > 0) || !pairRate || !effectiveWorkplaceRates.destinationRate) {
        consumedPendingBaseAmountRef.current = null;
        setPendingBaseAmount(value);
        onUpdateFxLine({ amount: value, exchangeRate: '' });
        return;
      }

      setPendingBaseAmount(null);
      persistRates(
        base * pairRate,
        effectiveWorkplaceRates.sourceRate,
        effectiveWorkplaceRates.destinationRate,
      );
    },
    [
      effectiveWorkplaceRates,
      isCrossCurrency,
      onUpdateAmount,
      onUpdateFxLine,
      pairRate,
      persistRates,
    ],
  );

  const handleConvertedAmountChange = useCallback(
    (value: string) => {
      if (!isCrossCurrency || !normalizedSourceCurrency) return;
      const base = Number.parseFloat(baseAmount);
      const converted = Number.parseFloat(value);
      const nextRates = resolveWorkplaceRatesFromConvertedAmount({
        sourceAmount: base,
        convertedAmount: converted,
        sourceCurrency: normalizedSourceCurrency,
        destCurrency: rowCurrencyCode,
        workplaceCurrency,
        existingSourceBaseRate: effectiveWorkplaceRates.sourceRate,
        existingDestBaseRate: effectiveWorkplaceRates.destinationRate,
      });
      if (!nextRates) return;

      setManualSourceBaseRate(
        normalizedSourceCurrency === workplaceCurrency
          ? ''
          : formatManualBaseRate(nextRates.sourceBaseRate),
      );
      setManualDestBaseRate(
        rowCurrencyCode === workplaceCurrency ? '' : formatManualBaseRate(nextRates.destBaseRate),
      );
      setPendingBaseAmount(null);
      persistRates(converted, nextRates.sourceBaseRate, nextRates.destBaseRate);
    },
    [
      baseAmount,
      effectiveWorkplaceRates,
      isCrossCurrency,
      normalizedSourceCurrency,
      persistRates,
      rowCurrencyCode,
      workplaceCurrency,
    ],
  );

  const handleResetToApiRate = useCallback(() => {
    consumedPendingBaseAmountRef.current = null;
    setPendingBaseAmount(baseAmount);
    setManualSourceBaseRate('');
    setManualDestBaseRate('');
    onUpdateFxLine({ amount: baseAmount, exchangeRate: '' });
    if (normalizedSourceCurrency !== workplaceCurrency) onUpdateSourceExchangeRate('');
    setRateRefreshNonce(nonce => nonce + 1);
  }, [
    baseAmount,
    normalizedSourceCurrency,
    onUpdateFxLine,
    onUpdateSourceExchangeRate,
    workplaceCurrency,
  ]);

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
        isCrossCurrency && styles.fxRowGroup,
        { borderTopColor: theme.border },
      ]}
      testID={`split-allocation-row-${row.id}`}
      accessibilityActions={canRemove ? [{ name: 'delete', label: removeLabel }] : undefined}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <SplitExchangeRateCard
        baseCurrency={normalizedSourceCurrency || currencyCode}
        convertedAmount={convertedAmount}
        convertedCurrency={rowCurrencyCode}
        exchangeRate={pairRate}
        isLoadingRate={rates.isLoadingRate}
        onConvertedAmountChange={handleConvertedAmountChange}
        onResetToApiRate={handleResetToApiRate}
        precision={rowPrecision}
        rateError={rates.rateError}
        visible={isCrossCurrency}
        testIDPrefix={`split-fx-${row.id}`}
      />
      <View style={styles.allocationRow}>
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
        />
        <CompactAmountInput
          value={baseAmount}
          onChangeText={handleBaseAmountChange}
          currency={isCrossCurrency ? normalizedSourceCurrency || currencyCode : rowCurrencyCode}
          currencySymbol={
            CURRENCY_SYMBOLS[
              isCrossCurrency ? normalizedSourceCurrency || currencyCode : rowCurrencyCode
            ] || (isCrossCurrency ? normalizedSourceCurrency || currencyCode : rowCurrencyCode)
          }
          precision={isCrossCurrency ? sourcePrecision : rowPrecision}
          placeholder={formatAmountPlaceholder(isCrossCurrency ? sourcePrecision : rowPrecision)}
          containerStyle={styles.amountInputContainer}
          inputStyle={[styles.amountInputText, { color: theme.text }]}
          testID={`split-amount-input-${row.id}`}
        />
      </View>
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
  allocationRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  categoryPicker: {
    flex: 1,
    minWidth: 0,
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
