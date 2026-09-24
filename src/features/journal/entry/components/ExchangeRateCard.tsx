import { Icon, AppIcon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import type { FxPair } from '@/src/features/journal/entry/fxPair';
import { ManualBaseRateField } from './ManualBaseRateField';
import { resolveExchangeRatePresentation } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { formatRoundedAmount } from '@/src/utils/money';
import { useCallback, useMemo, useState } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  type ViewStyle,
  View,
} from 'react-native';

export interface ExchangeRateCardProps {
  pair: FxPair;
  onConvertedAmountChange: (value: string) => void;
  onResetToApiRate: () => void;
  /** Omit to hide manual base-rate fields (split rows only accept a converted amount). */
  onManualBaseRateChange?: (role: 'source' | 'destination', value: string) => void;
  /** `attached` renders a compact tab joined to the row below it. */
  variant?: 'card' | 'attached';
  destLabel?: string;
  precision?: number;
  containerStyle?: StyleProp<ViewStyle>;
  testIDPrefix?: string;
}

const RESET_HIT_SLOP = { top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm };

export function ExchangeRateCard({
  pair,
  onConvertedAmountChange,
  onResetToApiRate,
  onManualBaseRateChange,
  variant = 'card',
  destLabel,
  precision = 2,
  containerStyle,
  testIDPrefix,
}: ExchangeRateCardProps) {
  const { theme, fonts } = useTheme();
  const [convertedDraft, setConvertedDraft] = useState<string | null>(null);
  const [isConvertedFocused, setIsConvertedFocused] = useState(false);
  const [convertedInputWidth, setConvertedInputWidth] = useState<number>(Size.fieldNarrow);
  const { sourceCurrency, destCurrency, baseCurrency, pairRate, isCrossCurrency } = pair;
  const isAttached = variant === 'attached';
  const formattedConverted =
    pair.convertedAmount === null ? '' : formatRoundedAmount(pair.convertedAmount, precision);
  const convertedInputValue = convertedDraft ?? formattedConverted;
  const destSymbol = destCurrency ? CURRENCY_SYMBOLS[destCurrency] || destCurrency : '';

  const displayedRate = useMemo(() => {
    if (!isCrossCurrency || pairRate === null) return null;
    const rate = { sourceCurrency, destinationCurrency: destCurrency, exchangeRate: pairRate };
    return resolveExchangeRatePresentation(rate);
  }, [destCurrency, isCrossCurrency, pairRate, sourceCurrency]);

  const testID = (suffix: string) => (testIDPrefix ? `${testIDPrefix}-${suffix}` : suffix);
  const cardTestID = testIDPrefix ? testID('card') : undefined;

  const handleConvertedChange = useCallback(
    (text: string) => {
      const sanitized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) return;
      if (parts[1] && parts[1].length > precision) return;
      setConvertedDraft(sanitized);
      if (parseFloat(sanitized) > 0) onConvertedAmountChange(sanitized);
    },
    [precision, onConvertedAmountChange],
  );

  const handleConvertedBlur = useCallback(() => {
    const next = convertedDraft?.endsWith('.') ? convertedDraft.slice(0, -1) : convertedDraft;
    setConvertedDraft(null);
    setIsConvertedFocused(false);
    if (!next || parseFloat(next) <= 0) return;
    onConvertedAmountChange(next);
  }, [convertedDraft, onConvertedAmountChange]);

  const handleResetToApiRate = useCallback(() => {
    setConvertedDraft(null);
    onResetToApiRate();
  }, [onResetToApiRate]);

  if (!isCrossCurrency && !pair.needsManualRates) return null;

  const rateSummary = pair.isLoading ? (
    <AppText variant="caption" color="secondary">
      {AppConfig.strings.transactionFlow.fetchingRate}
    </AppText>
  ) : displayedRate ? (
    <View style={isAttached ? styles.attachedRateRow : styles.fxRateRow}>
      <View style={styles.fxRateLabel}>
        <AppText variant="caption" color="tertiary" numberOfLines={1} ellipsizeMode="tail">
          1 {displayedRate.sourceCurrency} = {formatRoundedAmount(displayedRate.exchangeRate, 4)}{' '}
          {displayedRate.destinationCurrency}
        </AppText>
      </View>
      <TouchableOpacity
        onPress={handleResetToApiRate}
        accessibilityRole="button"
        accessibilityLabel={AppConfig.strings.transactionFlow.resetToMarketRate}
        testID={testID('reset-fx-rate-button')}
        hitSlop={RESET_HIT_SLOP}
      >
        <AppIcon name={Icon.Refresh} size={Size.iconXs} color={theme.primary} />
      </TouchableOpacity>
    </View>
  ) : isAttached ? (
    <AppText variant="caption" color={pair.rateError ? 'error' : 'secondary'} numberOfLines={2}>
      {pair.rateError ||
        AppConfig.strings.transactionFlow.enterConvertedOrWorkplaceRate(destCurrency ?? '')}
    </AppText>
  ) : pair.rateError ? (
    <View style={styles.fxRateStatus}>
      <AppText variant="caption" color="error">
        {pair.rateError}.{' '}
        {AppConfig.strings.transactionFlow.enterConvertedOrWorkplaceRate(baseCurrency)}
      </AppText>
    </View>
  ) : pair.needsBaseRate ? (
    <View style={styles.fxRateStatus}>
      <AppText variant="caption" color="secondary">
        {AppConfig.strings.transactionFlow.enterConvertedOrWorkplaceRate(baseCurrency)}
      </AppText>
    </View>
  ) : null;

  const convertedInput = destCurrency ? (
    <TextInput
      value={convertedInputValue}
      onChangeText={handleConvertedChange}
      onFocus={() => {
        setIsConvertedFocused(true);
        setConvertedDraft(convertedDraft ?? formattedConverted);
      }}
      onBlur={handleConvertedBlur}
      onSubmitEditing={handleConvertedBlur}
      keyboardType="decimal-pad"
      multiline={false}
      selectTextOnFocus
      placeholder="0"
      placeholderTextColor={withOpacity(theme.text, Opacity.medium)}
      cursorColor={theme.primary}
      selectionColor={withOpacity(theme.primary, Opacity.muted)}
      accessibilityLabel={
        destLabel
          ? AppConfig.strings.transactionFlow.simpleEntry.editConvertedAmount(
              destLabel,
              destCurrency,
            )
          : `Converted amount in ${destCurrency}`
      }
      testID={testID('converted-amount-input')}
      style={[
        styles.convertedInput,
        isAttached ? styles.attachedConvertedInput : { width: convertedInputWidth },
        isConvertedFocused && { borderBottomWidth: 1, borderBottomColor: theme.primary },
        { color: theme.text, fontFamily: fonts.bold },
      ]}
    />
  ) : null;

  const cardColors = {
    backgroundColor: withOpacity(theme.primary, Opacity.selection),
    borderColor: withOpacity(theme.primary, Opacity.active),
  };

  if (isAttached) {
    return (
      <View style={[styles.attachedCard, cardColors, containerStyle]} testID={cardTestID}>
        <View style={styles.attachedRateBlock}>{rateSummary}</View>
        <View style={styles.attachedConvertedBlock}>
          <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
          <AppText variant="caption" color="secondary">
            {destSymbol}
          </AppText>
          {convertedInput}
        </View>
      </View>
    );
  }

  const showSourceRateField = Boolean(sourceCurrency && sourceCurrency !== baseCurrency);
  const showDestRateField = Boolean(
    destCurrency && destCurrency !== baseCurrency && destCurrency !== sourceCurrency,
  );

  return (
    <View style={[styles.fxCard, containerStyle, cardColors]} testID={cardTestID}>
      {pair.isLoading ? (
        rateSummary
      ) : (
        <View style={styles.fxContent}>
          <View style={styles.fxSummaryRow}>
            {rateSummary}

            {isCrossCurrency && destCurrency && pair.sourceAmount > 0 && (
              <View
                style={styles.convertedRow}
                accessibilityLabel={`${destLabel}: ${pair.convertedAmount ?? pair.sourceAmount} ${destCurrency}`}
              >
                <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
                <View style={styles.fxLegAmountRow}>
                  <AppText variant="caption" color="secondary">
                    {destSymbol}
                  </AppText>
                  {convertedInput}
                  <Text
                    accessible={false}
                    pointerEvents="none"
                    onLayout={event => {
                      const measuredWidth = Math.ceil(event.nativeEvent.layout.width);
                      const nextWidth = Math.max(Size.fieldNarrow, measuredWidth + Spacing.xs);
                      setConvertedInputWidth(current =>
                        current === nextWidth ? current : nextWidth,
                      );
                    }}
                    testID={testID('converted-amount-measure')}
                    style={[
                      styles.convertedMeasure,
                      { fontFamily: fonts.bold, color: withOpacity(theme.text, Opacity.none) },
                    ]}
                  >
                    {convertedInputValue || '0'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {pair.needsManualRates && onManualBaseRateChange && (
            <View style={styles.manualRateFields}>
              {showSourceRateField && sourceCurrency && (
                <ManualBaseRateField
                  currency={sourceCurrency}
                  workplaceCurrency={baseCurrency}
                  value={pair.manualSourceBaseRate}
                  onChangeText={value => onManualBaseRateChange('source', value)}
                />
              )}
              {showDestRateField && destCurrency && (
                <ManualBaseRateField
                  currency={destCurrency}
                  workplaceCurrency={baseCurrency}
                  value={pair.manualDestBaseRate}
                  onChangeText={value => onManualBaseRateChange('destination', value)}
                />
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fxCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Shape.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
  fxContent: { gap: Spacing.xs, width: '100%' },
  fxSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
  },
  fxLegAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    flexShrink: 0,
  },
  convertedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Size.md,
    gap: Spacing.sm,
    marginLeft: Spacing.sm,
    flexShrink: 0,
  },
  fxRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  fxRateStatus: {
    flex: 1,
    flexShrink: 1,
  },
  fxRateLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
    flexShrink: 1,
  },
  convertedInput: {
    flexShrink: 0,
    paddingHorizontal: 0,
    paddingVertical: Spacing.none,
    margin: 0,
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    textAlign: 'right',
  },
  convertedMeasure: {
    position: 'absolute',
    left: -10000,
    top: 0,
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    padding: 0,
    margin: 0,
  },
  manualRateFields: { width: '100%', gap: Spacing.xs },
  attachedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Size.controlCompact,
    marginBottom: -StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Shape.radius.md,
    borderTopRightRadius: Shape.radius.md,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    gap: Spacing.sm,
  },
  attachedRateBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  attachedRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
    flexShrink: 1,
  },
  attachedConvertedBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  attachedConvertedInput: {
    minWidth: 42,
    flexShrink: 1,
  },
});
