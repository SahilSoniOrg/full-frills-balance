import { type CreateAccountIntent } from '@/src/components/account-selection';
import { Icon, AppIcon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { SimpleFormAmountInput } from './SimpleFormAmountInput';
import { SimpleFormAccountSections } from './SimpleFormAccountSections';
import { useSimpleFormExpansion, type AccountFlowHandle } from './useSimpleFormExpansion';
import { ManualBaseRateField } from '@/src/features/journal/entry/components/ManualBaseRateField';
import { resolveExchangeRatePresentation } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { AccountId } from '@/src/types/ids';
import type { AccountFields } from '@/src/types/plainDtos';
import { withOpacity } from '@/src/utils/color-math';
import React, {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

export interface SimpleFormAccountSection {
  title: string;
  accounts: AccountFields[];
  selectedId: AccountId;
  onSelect: (id: AccountId) => void;
  role: AccountRole;
}

export interface SimpleFormProps {
  type: TabType;
  amount: string;
  setAmount: (val: string) => void;
  currency: string;
  accentColor: string;
  precision?: number;
  leadingContent: ReactNode;
  onScrollBeginDrag?: () => void;

  // Accounts
  accounts: AccountFields[];
  accountSections: SimpleFormAccountSection[];
  sourceId: AccountId;
  destinationId: AccountId;
  onSwapAccounts?: () => void;
  onCreateAccountRequest?: (role: AccountRole, intent: CreateAccountIntent) => void;

  // Cross-Currency
  isCrossCurrency: boolean;
  exchangeRate: number | null;
  isLoadingRate: boolean;
  rateError: string | null;
  convertedAmount: number;
  sourceCurrency?: string;
  destCurrency?: string;
  workplaceCurrency: string;
  needsWorkplaceRate: boolean;
  showManualRateFields: boolean;
  manualSourceBaseRate: string;
  manualDestBaseRate: string;
  setManualBaseRate: (role: 'source' | 'destination', value: string) => void;
  setConvertedAmount: (value: string) => void;
  resetToApiRate: () => void;
  autoOpenCalculator?: boolean;
  autopilotFirstRole?: AccountRole;
  onCalculatorDone?: () => void;
  accountFlowRef?: RefObject<AccountFlowHandle | null>;
}

export const SimpleForm = React.memo(function SimpleForm({
  type,
  amount,
  setAmount,
  currency,
  accentColor,
  precision = 2,
  leadingContent,
  onScrollBeginDrag,
  accounts,
  accountSections,
  sourceId,
  destinationId,
  onSwapAccounts,
  onCreateAccountRequest,
  isCrossCurrency,
  exchangeRate,
  isLoadingRate,
  rateError,
  convertedAmount,
  sourceCurrency,
  destCurrency,
  workplaceCurrency,
  needsWorkplaceRate,
  showManualRateFields,
  manualSourceBaseRate,
  manualDestBaseRate,
  setManualBaseRate,
  setConvertedAmount,
  resetToApiRate,
  autoOpenCalculator = false,
  autopilotFirstRole,
  onCalculatorDone,
  accountFlowRef,
}: SimpleFormProps) {
  const { theme, fonts } = useTheme();

  const accountsMap = useMemo(
    () => new Map<string, AccountFields>(accounts.map(a => [a.id, a])),
    [accounts],
  );

  const sourceAccount = useMemo(
    () => (sourceId ? accountsMap.get(sourceId) : undefined),
    [accountsMap, sourceId],
  );
  const destAccount = useMemo(
    () => (destinationId ? accountsMap.get(destinationId) : undefined),
    [accountsMap, destinationId],
  );

  // Section titles and configs
  const sourceSection = useMemo(
    () => accountSections.find(s => s.role === 'source'),
    [accountSections],
  );
  const destSection = useMemo(
    () => accountSections.find(s => s.role === 'destination'),
    [accountSections],
  );
  const [convertedDraft, setConvertedDraft] = useState<string | null>(null);
  const convertedInputRef = useRef<TextInput>(null);
  const formattedConverted = convertedAmount.toFixed(precision);
  const convertedInputValue = convertedDraft ?? (exchangeRate ? formattedConverted : '');
  const sourceSymbol = CURRENCY_SYMBOLS[sourceCurrency || currency] || sourceCurrency || currency;
  const destSymbol = destCurrency ? CURRENCY_SYMBOLS[destCurrency] || destCurrency : '';

  const handleConvertedChange = useCallback(
    (text: string) => {
      const normalized = text.replace(/,/g, '.');
      const sanitized = normalized.replace(/[^0-9.]/g, '');
      const parts = sanitized.split('.');
      if (parts.length > 2) return;
      if (parts[1] && parts[1].length > precision) return;
      setConvertedDraft(sanitized);
    },
    [precision],
  );

  const handleConvertedBlur = useCallback(() => {
    const next = convertedDraft?.endsWith('.') ? convertedDraft.slice(0, -1) : convertedDraft;
    setConvertedDraft(null);
    if (!next || parseFloat(next) <= 0) return;
    setConvertedAmount(next);
  }, [convertedDraft, setConvertedAmount]);

  const handleResetToApiRate = useCallback(() => {
    setConvertedDraft(null);
    resetToApiRate();
  }, [resetToApiRate]);

  const handleConvertedEditPress = useCallback(() => {
    convertedInputRef.current?.focus();
  }, []);

  const {
    expansionPosition,
    handleSelectDestination,
    handleSelectSource,
    handleToggleExpansion,
    startAutopilotAccountFlow,
  } = useSimpleFormExpansion({
    type,
    sourceId,
    destinationId,
    autopilotFirstRole,
    onSelectSource: id => sourceSection?.onSelect(id),
    onSelectDestination: id => destSection?.onSelect(id),
  });

  useEffect(() => {
    if (!accountFlowRef) return;
    accountFlowRef.current = { start: startAutopilotAccountFlow };
    return () => {
      accountFlowRef.current = null;
    };
  }, [accountFlowRef, startAutopilotAccountFlow]);

  // Cross-Currency
  const displayedRate = useMemo(
    () =>
      isCrossCurrency && exchangeRate
        ? resolveExchangeRatePresentation({
            sourceCurrency,
            destinationCurrency: destCurrency,
            exchangeRate,
          })
        : null,
    [isCrossCurrency, exchangeRate, sourceCurrency, destCurrency],
  );

  const showRateCard = Boolean(
    sourceId && destinationId && (isCrossCurrency || showManualRateFields),
  );
  const showSourceRateField = Boolean(sourceCurrency && sourceCurrency !== workplaceCurrency);
  const showDestRateField = Boolean(
    destCurrency && destCurrency !== workplaceCurrency && destCurrency !== sourceCurrency,
  );

  // Node Labels: Left is Source, Right is Destination
  const sourceLabel =
    sourceSection?.title || AppConfig.strings.transactionFlow.simpleEntry.sourceAccount;
  const destLabel =
    destSection?.title || AppConfig.strings.transactionFlow.simpleEntry.destinationAccount;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      stickyHeaderIndices={[1]}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={onScrollBeginDrag}
      scrollEventThrottle={16}
      testID="simple-entry-scroll-view"
    >
      <View>{leadingContent}</View>

      <View style={[styles.stickyAmount, { backgroundColor: theme.background }]}>
        <SimpleFormAmountInput
          amount={amount}
          setAmount={setAmount}
          currency={currency}
          accentColor={accentColor}
          precision={precision}
          autoOpenCalculator={autoOpenCalculator}
          onCalculatorDone={onCalculatorDone}
        />
      </View>

      <SimpleFormAccountSections
        expansionPosition={expansionPosition}
        onToggleExpansion={handleToggleExpansion}
        sourceLabel={sourceLabel}
        sourceAccount={sourceAccount}
        sourceAccounts={sourceSection?.accounts ?? []}
        onSelectSource={handleSelectSource}
        destLabel={destLabel}
        destAccount={destAccount}
        destAccounts={destSection?.accounts ?? []}
        onSelectDestination={handleSelectDestination}
        type={type}
        onSwapAccounts={onSwapAccounts}
        allAccounts={accounts}
        onCreateAccountRequest={onCreateAccountRequest}
      />

      {showRateCard && (
        <View
          style={[
            styles.fxCard,
            {
              backgroundColor: withOpacity(theme.primary, Opacity.soft),
              borderColor: withOpacity(theme.primary, Opacity.medium),
            },
          ]}
        >
          {isLoadingRate ? (
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.transactionFlow.fetchingRate}
            </AppText>
          ) : (
            <View style={styles.fxContent}>
              {isCrossCurrency && destCurrency && parseFloat(amount) > 0 && (
                <View style={styles.fxLegsRow}>
                  <View
                    style={styles.fxLeg}
                    accessibilityLabel={`${sourceLabel}: ${amount} ${sourceCurrency || currency}`}
                  >
                    <AppText variant="caption" color="tertiary" weight="bold">
                      {sourceLabel}
                    </AppText>
                    <View style={styles.fxLegAmountRow}>
                      <AppText variant="caption" color="secondary">
                        {sourceSymbol}
                      </AppText>
                      <AppText variant="body" weight="bold" numberOfLines={1}>
                        {amount}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.fxLegConnector}>
                    <AppIcon name={Icon.ArrowRight} size={Size.xxs} color={theme.textTertiary} />
                  </View>

                  <View style={styles.fxLeg}>
                    <AppText variant="caption" color="tertiary" weight="bold">
                      {destLabel}
                    </AppText>
                    <View style={styles.fxLegAmountRow}>
                      <AppText variant="caption" color="secondary">
                        {destSymbol}
                      </AppText>
                      <TextInput
                        ref={convertedInputRef}
                        value={convertedInputValue}
                        onChangeText={handleConvertedChange}
                        onFocus={() =>
                          setConvertedDraft(
                            convertedDraft ?? (exchangeRate ? formattedConverted : ''),
                          )
                        }
                        onBlur={handleConvertedBlur}
                        onSubmitEditing={handleConvertedBlur}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        placeholder="0"
                        placeholderTextColor={withOpacity(theme.text, Opacity.medium)}
                        cursorColor={theme.primary}
                        selectionColor={withOpacity(theme.primary, Opacity.muted)}
                        accessibilityLabel={AppConfig.strings.transactionFlow.simpleEntry.editConvertedAmount(
                          destLabel,
                          destCurrency,
                        )}
                        testID="converted-amount-input"
                        style={[
                          styles.convertedInput,
                          { color: theme.text, fontFamily: fonts.bold },
                        ]}
                      />
                      <TouchableOpacity
                        onPress={handleConvertedEditPress}
                        accessibilityRole="button"
                        accessibilityLabel={AppConfig.strings.transactionFlow.simpleEntry.editConvertedAmount(
                          destLabel,
                          destCurrency,
                        )}
                        hitSlop={{
                          top: Spacing.sm,
                          bottom: Spacing.sm,
                          left: Spacing.sm,
                          right: Spacing.sm,
                        }}
                      >
                        <AppIcon name={Icon.Edit} size={Size.iconXs} color={theme.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {displayedRate ? (
                <View style={styles.fxRateRow}>
                  <TouchableOpacity
                    onPress={handleResetToApiRate}
                    accessibilityRole="button"
                    accessibilityLabel={AppConfig.strings.transactionFlow.resetToMarketRate}
                    testID="reset-fx-rate-button"
                    hitSlop={{
                      top: Spacing.sm,
                      bottom: Spacing.sm,
                      left: Spacing.sm,
                      right: Spacing.sm,
                    }}
                  >
                    <AppIcon name={Icon.Refresh} size={Size.iconXs} color={theme.primary} />
                  </TouchableOpacity>
                  <AppText variant="caption" color="primary" weight="semibold">
                    1 {displayedRate.sourceCurrency} = {displayedRate.exchangeRate.toFixed(4)}{' '}
                    {displayedRate.destinationCurrency}
                  </AppText>
                </View>
              ) : rateError ? (
                <AppText variant="caption" color="error">
                  {rateError}.{' '}
                  {AppConfig.strings.transactionFlow.enterConvertedOrWorkplaceRate(
                    workplaceCurrency,
                  )}
                </AppText>
              ) : needsWorkplaceRate ? (
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.transactionFlow.enterConvertedOrWorkplaceRate(
                    workplaceCurrency,
                  )}
                </AppText>
              ) : null}

              {showManualRateFields && (
                <View style={styles.manualRateFields}>
                  {showSourceRateField && sourceCurrency && (
                    <ManualBaseRateField
                      currency={sourceCurrency}
                      workplaceCurrency={workplaceCurrency}
                      value={manualSourceBaseRate}
                      onChangeText={val => setManualBaseRate('source', val)}
                    />
                  )}
                  {showDestRateField && destCurrency && (
                    <ManualBaseRateField
                      currency={destCurrency}
                      workplaceCurrency={workplaceCurrency}
                      value={manualDestBaseRate}
                      onChangeText={val => setManualBaseRate('destination', val)}
                    />
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxxxl + Size.xxl,
  },
  stickyAmount: {
    paddingVertical: Spacing.xs,
    zIndex: 2,
  },
  fxCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Shape.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  fxContent: {
    gap: Spacing.sm,
    width: '100%',
  },
  fxLegsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.xs,
    width: '100%',
  },
  fxLeg: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  fxLegConnector: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fxLegAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    minWidth: 0,
  },
  fxRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  convertedInput: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: Size.xl,
    paddingVertical: Spacing.none,
    margin: 0,
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    textAlign: 'left',
  },
  manualRateFields: {
    width: '100%',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
});
