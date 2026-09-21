import { Icon, AppIcon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { ManualBaseRateField } from './ManualBaseRateField';
import { resolveExchangeRatePresentation } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
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
  amount: string;
  destLabel: string;
  sourceCurrency?: string;
  destCurrency?: string;
  workplaceCurrency: string;
  isCrossCurrency: boolean;
  exchangeRate: number | string | null;
  isLoadingRate: boolean;
  rateError?: string | null;
  convertedAmount: number;
  needsWorkplaceRate: boolean;
  showManualRateFields: boolean;
  manualSourceBaseRate: string;
  manualDestBaseRate: string;
  setManualBaseRate: (role: 'source' | 'destination', value: string) => void;
  setConvertedAmount: (value: string) => void;
  resetToApiRate: () => void;
  visible: boolean;
  precision?: number;
  containerStyle?: StyleProp<ViewStyle>;
  testIDPrefix?: string;
}

export function ExchangeRateCard({
  amount,
  destLabel,
  sourceCurrency,
  destCurrency,
  workplaceCurrency,
  isCrossCurrency,
  exchangeRate,
  isLoadingRate,
  rateError,
  convertedAmount,
  needsWorkplaceRate,
  showManualRateFields,
  manualSourceBaseRate,
  manualDestBaseRate,
  setManualBaseRate,
  setConvertedAmount,
  resetToApiRate,
  visible,
  precision = 2,
  containerStyle,
  testIDPrefix,
}: ExchangeRateCardProps) {
  const { theme, fonts } = useTheme();
  const [convertedDraft, setConvertedDraft] = useState<string | null>(null);
  const [isConvertedFocused, setIsConvertedFocused] = useState(false);
  const [convertedInputWidth, setConvertedInputWidth] = useState(72);
  const validExchangeRate = useMemo(() => {
    const numericRate = typeof exchangeRate === 'string' ? Number(exchangeRate) : exchangeRate;
    return typeof numericRate === 'number' && Number.isFinite(numericRate) && numericRate > 0
      ? numericRate
      : null;
  }, [exchangeRate]);
  const formattedConverted = convertedAmount.toFixed(precision);
  const convertedInputValue =
    convertedDraft ?? (validExchangeRate !== null ? formattedConverted : '');
  const destSymbol = destCurrency ? CURRENCY_SYMBOLS[destCurrency] || destCurrency : '';

  const displayedRate = useMemo(() => {
    return isCrossCurrency && validExchangeRate !== null
      ? resolveExchangeRatePresentation({
          sourceCurrency,
          destinationCurrency: destCurrency,
          exchangeRate: validExchangeRate,
        })
      : null;
  }, [isCrossCurrency, validExchangeRate, sourceCurrency, destCurrency]);

  const showSourceRateField = Boolean(sourceCurrency && sourceCurrency !== workplaceCurrency);
  const showDestRateField = Boolean(
    destCurrency && destCurrency !== workplaceCurrency && destCurrency !== sourceCurrency,
  );

  const testID = (suffix: string) => (testIDPrefix ? `${testIDPrefix}-${suffix}` : suffix);

  const handleConvertedChange = useCallback(
    (text: string) => {
      const normalized = text.replace(/,/g, '.');
      const sanitized = normalized.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) return;
      if (parts[1] && parts[1].length > precision) return;
      setConvertedDraft(sanitized);
      if (parseFloat(sanitized) > 0) setConvertedAmount(sanitized);
    },
    [precision, setConvertedAmount],
  );

  const handleConvertedBlur = useCallback(() => {
    const next = convertedDraft?.endsWith('.') ? convertedDraft.slice(0, -1) : convertedDraft;
    setConvertedDraft(null);
    setIsConvertedFocused(false);
    if (!next || parseFloat(next) <= 0) return;
    setConvertedAmount(next);
  }, [convertedDraft, setConvertedAmount]);

  const handleResetToApiRate = useCallback(() => {
    setConvertedDraft(null);
    resetToApiRate();
  }, [resetToApiRate]);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.fxCard,
        containerStyle,
        {
          backgroundColor: withOpacity(theme.primary, Opacity.selection),
          borderColor: withOpacity(theme.primary, Opacity.active),
        },
      ]}
    >
      {isLoadingRate ? (
        <AppText variant="caption" color="secondary">
          {AppConfig.strings.transactionFlow.fetchingRate}
        </AppText>
      ) : (
        <View style={styles.fxContent}>
          <View style={styles.fxSummaryRow}>
            {displayedRate ? (
              <View style={styles.fxRateRow}>
                <View style={styles.fxRateLabel}>
                  <AppText
                    variant="caption"
                    color="tertiary"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    1 {displayedRate.sourceCurrency} = {displayedRate.exchangeRate.toFixed(4)}{' '}
                    {displayedRate.destinationCurrency}
                  </AppText>
                </View>
                <TouchableOpacity
                  onPress={handleResetToApiRate}
                  accessibilityRole="button"
                  accessibilityLabel={AppConfig.strings.transactionFlow.resetToMarketRate}
                  testID={testID('reset-fx-rate-button')}
                  hitSlop={{
                    top: Spacing.sm,
                    bottom: Spacing.sm,
                    left: Spacing.sm,
                    right: Spacing.sm,
                  }}
                >
                  <AppIcon name={Icon.Refresh} size={Size.iconXs} color={theme.primary} />
                </TouchableOpacity>
              </View>
            ) : rateError ? (
              <View style={styles.fxRateStatus}>
                <AppText variant="caption" color="error">
                  {rateError}.{' '}
                  {AppConfig.strings.transactionFlow.enterConvertedOrWorkplaceRate(
                    workplaceCurrency,
                  )}
                </AppText>
              </View>
            ) : needsWorkplaceRate ? (
              <View style={styles.fxRateStatus}>
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.transactionFlow.enterConvertedOrWorkplaceRate(
                    workplaceCurrency,
                  )}
                </AppText>
              </View>
            ) : null}

            {isCrossCurrency && destCurrency && parseFloat(amount) > 0 && (
              <View
                style={styles.convertedRow}
                accessibilityLabel={`${destLabel}: ${convertedAmount} ${destCurrency}`}
              >
                <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
                <View style={styles.fxLegAmountRow}>
                  <AppText variant="caption" color="secondary">
                    {destSymbol}
                  </AppText>
                  <TextInput
                    value={convertedInputValue}
                    onChangeText={handleConvertedChange}
                    onFocus={() => {
                      setIsConvertedFocused(true);
                      setConvertedDraft(
                        convertedDraft ?? (validExchangeRate !== null ? formattedConverted : ''),
                      );
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
                    accessibilityLabel={AppConfig.strings.transactionFlow.simpleEntry.editConvertedAmount(
                      destLabel,
                      destCurrency,
                    )}
                    testID={testID('converted-amount-input')}
                    style={[
                      styles.convertedInput,
                      { width: convertedInputWidth },
                      isConvertedFocused && {
                        borderBottomWidth: 1,
                        borderBottomColor: theme.primary,
                      },
                      { color: theme.text, fontFamily: fonts.bold },
                    ]}
                  />
                  <Text
                    accessible={false}
                    pointerEvents="none"
                    onLayout={event => {
                      const measuredWidth = Math.ceil(event.nativeEvent.layout.width);
                      const nextWidth = Math.max(72, measuredWidth + Spacing.xs);
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

          {showManualRateFields && (
            <View style={styles.manualRateFields}>
              {showSourceRateField && sourceCurrency && (
                <ManualBaseRateField
                  currency={sourceCurrency}
                  workplaceCurrency={workplaceCurrency}
                  value={manualSourceBaseRate}
                  onChangeText={value => setManualBaseRate('source', value)}
                />
              )}
              {showDestRateField && destCurrency && (
                <ManualBaseRateField
                  currency={destCurrency}
                  workplaceCurrency={workplaceCurrency}
                  value={manualDestBaseRate}
                  onChangeText={value => setManualBaseRate('destination', value)}
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
});
