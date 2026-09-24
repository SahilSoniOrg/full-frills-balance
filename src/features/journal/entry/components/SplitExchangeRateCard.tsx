import { Icon, AppIcon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import { formatRoundedAmount } from '@/src/utils/money';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export interface SplitExchangeRateCardProps {
  baseCurrency: string;
  convertedAmount: string;
  convertedCurrency: string;
  exchangeRate: number | null;
  isLoadingRate: boolean;
  rateError?: string | null;
  onConvertedAmountChange: (value: string) => void;
  onResetToApiRate: () => void;
  precision: number;
  visible: boolean;
  testIDPrefix?: string;
}

export function SplitExchangeRateCard({
  baseCurrency,
  convertedAmount,
  convertedCurrency,
  exchangeRate,
  isLoadingRate,
  rateError,
  onConvertedAmountChange,
  onResetToApiRate,
  precision,
  visible,
  testIDPrefix = 'split-fx',
}: SplitExchangeRateCardProps) {
  const { theme, fonts } = useTheme();
  const [convertedDraft, setConvertedDraft] = useState<string | null>(null);
  const convertedSymbol = CURRENCY_SYMBOLS[convertedCurrency] || convertedCurrency;
  const validExchangeRate =
    typeof exchangeRate === 'number' && Number.isFinite(exchangeRate) && exchangeRate > 0
      ? exchangeRate
      : null;
  const displayedRate = useMemo(
    () =>
      validExchangeRate === null
        ? null
        : {
            sourceCurrency: baseCurrency,
            destinationCurrency: convertedCurrency,
            exchangeRate: validExchangeRate,
          },
    [baseCurrency, convertedCurrency, validExchangeRate],
  );
  const displayedConvertedAmount = convertedDraft ?? convertedAmount;
  const testID = (suffix: string) => `${testIDPrefix}-${suffix}`;

  const handleConvertedChange = useCallback(
    (value: string) => {
      const sanitized = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
      if (sanitized.split('.').length > 2) return;
      if (sanitized.split('.')[1]?.length > precision) return;
      setConvertedDraft(sanitized);
      if (Number.parseFloat(sanitized) > 0) onConvertedAmountChange(sanitized);
    },
    [onConvertedAmountChange, precision],
  );

  const handleConvertedBlur = useCallback(() => {
    const next = convertedDraft?.endsWith('.') ? convertedDraft.slice(0, -1) : convertedDraft;
    setConvertedDraft(null);
    if (next && Number.parseFloat(next) > 0) onConvertedAmountChange(next);
  }, [convertedDraft, onConvertedAmountChange]);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: withOpacity(theme.primary, Opacity.selection),
          borderColor: withOpacity(theme.primary, Opacity.active),
        },
      ]}
      testID={testID('card')}
    >
      <View style={styles.rateBlock}>
        {isLoadingRate ? (
          <AppText variant="caption" color="secondary">
            {AppConfig.strings.transactionFlow.fetchingRate}
          </AppText>
        ) : displayedRate ? (
          <>
            <AppText variant="caption" color="tertiary" numberOfLines={1}>
              1 {displayedRate.sourceCurrency} ={' '}
              {formatRoundedAmount(displayedRate.exchangeRate, 4)}{' '}
              {displayedRate.destinationCurrency}
            </AppText>
            <TouchableOpacity
              onPress={onResetToApiRate}
              accessibilityRole="button"
              accessibilityLabel={AppConfig.strings.transactionFlow.resetToMarketRate}
              testID={testID('reset-rate-button')}
              hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
            >
              <AppIcon name={Icon.Refresh} size={Size.iconXs} color={theme.primary} />
            </TouchableOpacity>
          </>
        ) : (
          <AppText variant="caption" color={rateError ? 'error' : 'secondary'} numberOfLines={2}>
            {rateError ||
              AppConfig.strings.transactionFlow.enterConvertedOrWorkplaceRate(convertedCurrency)}
          </AppText>
        )}
      </View>

      <View style={styles.convertedBlock}>
        <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
        <AppText variant="caption" color="secondary">
          {convertedSymbol}
        </AppText>
        <TextInput
          value={displayedConvertedAmount}
          onChangeText={handleConvertedChange}
          onBlur={handleConvertedBlur}
          keyboardType="decimal-pad"
          multiline={false}
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor={withOpacity(theme.text, Opacity.medium)}
          cursorColor={theme.primary}
          selectionColor={withOpacity(theme.text, Opacity.muted)}
          accessibilityLabel={`Converted amount in ${convertedCurrency}`}
          testID={testID('converted-amount-input')}
          style={[styles.convertedInput, { color: theme.text, fontFamily: fonts.bold }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  rateBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  convertedBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  convertedInput: {
    minWidth: 42,
    flexShrink: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
    margin: 0,
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    textAlign: 'right',
  },
});
