import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { MultiAccountPickerModal } from '@/src/components/account-selection';
import {
  AppIcon,
  AppText,
  FilterChipButton,
  Icon,
  ListGroup,
  LoadingView,
} from '@/src/components/core';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { FormRow, ScheduleField, SuggestionHint, UnderlineNameField } from '@/src/components/forms';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import {
  CurrencyPickerSheet,
  CurrencySideControl,
  resolveCurrencySymbol,
} from '@/src/features/accounts';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { budgetFormStrings as copy } from '@/src/constants/copy/domains/budgetFormStrings';
import { FadeIn, Inline, Stack } from '@/src/design-system';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useTheme } from '@/src/hooks/use-theme';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { getReadableColor } from '@/src/design-system/colorMath';
import { toast } from '@/src/services/feedback/alerts';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { BudgetSpendingHistoryChart } from './BudgetSpendingHistoryChart';
import type { BudgetEditViewModel } from '../hooks/useBudgetEditViewModel';

export function BudgetEditView({
  expenseAccounts,
  liquidAssetAccounts,
  name,
  setName,
  amount,
  setAmount,
  currencies,
  currencyCode,
  setCurrencyCode,
  selectedAccountIds,
  setSelectedAccountIds,
  selectedCategories,
  categorySuggestions,
  addCategory,
  removeCategory,
  assetAccountIds,
  setAssetAccountIds,
  fundingLabel,
  schedule,
  scheduleStartDate,
  setSchedule,
  spendingHistory,
  averageSpend,
  useAverage,
  amountLabel,
  save,
  loading,
  isSaving,
  isFormValid,
  requirementHint,
  budget,
  onCancel,
}: BudgetEditViewModel) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isAssetPickerVisible, setIsAssetPickerVisible] = useState(false);
  const [isCurrencyPickerVisible, setIsCurrencyPickerVisible] = useState(false);
  const currency = currencies.find(item => item.code === currencyCode);
  const precision = currency?.precision ?? getCurrencyPrecision(currencyCode);
  const currencySymbol = resolveCurrencySymbol(currencyCode, currencies, CURRENCY_SYMBOLS);
  const expenseInk = getReadableColor(theme.expense, theme.errorLight);

  const loadingChrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: AppConfig.strings.common.loading,
      kind: 'nav',
      onBack: onCancel,
    }),
    [onCancel],
  );

  const formChrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: budget
        ? AppConfig.strings.budget.formTitleEdit
        : AppConfig.strings.budget.formTitleNew,
      kind: 'nav',
      onBack: onCancel,
    }),
    [budget, onCancel],
  );

  if (loading) {
    return (
      <ScreenWithChrome chrome={loadingChrome}>
        <LoadingView loading={true} text={AppConfig.strings.budget.loading} />
      </ScreenWithChrome>
    );
  }

  const handleSave = async () => {
    try {
      await save();
      toast.success('Budget saved');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save budget');
    }
  };

  return (
    <>
      <EntityFormScreen
        chrome={formChrome}
        submitAction={{
          onPress: handleSave,
          disabled: !isFormValid || isSaving,
          requirementHint,
          label: budget
            ? isSaving
              ? 'Updating...'
              : 'Update Budget'
            : isSaving
              ? 'Creating...'
              : 'Create Budget',
        }}
      >
        <Stack gap="lg" paddingHorizontal="lg">
          <UnderlineNameField
            value={name}
            onChangeText={setName}
            placeholder={copy.namePlaceholder}
          />

          <Stack gap="sm">
            <SectionLabel label={copy.whatCounts} marginTop="none" />
            {selectedCategories.length ? (
              <Inline testID="budget-selected-categories" gap="sm" wrap>
                {selectedCategories.map(account => (
                  <Inline
                    key={account.id}
                    testID={`budget-category-chip-${account.id}`}
                    gap="xs"
                    alignItems="center"
                    paddingHorizontal="sm"
                    style={{
                      minHeight: Size.touchTarget - Spacing.xs,
                      borderRadius: Shape.radius.full,
                      backgroundColor: theme.errorLight,
                    }}
                  >
                    <AppIcon
                      name={account.icon ?? Icon.Tag}
                      size={Size.iconXs}
                      color={expenseInk}
                    />
                    <AppText variant="caption" weight="semibold" style={{ color: expenseInk }}>
                      {account.name}
                    </AppText>
                    <PressScaleTouchable
                      testID={`budget-category-remove-${account.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={copy.removeCategory(account.name)}
                      hitSlop={8}
                      onPress={() => removeCategory(account.id)}
                    >
                      <AppIcon name={Icon.Close} size={Size.iconXs} color={expenseInk} />
                    </PressScaleTouchable>
                  </Inline>
                ))}
              </Inline>
            ) : (
              <Stack gap="sm">
                <AppText variant="bodySmall" color="secondary">
                  {copy.whatCountsHint}
                </AppText>
                <Inline gap="sm" wrap>
                  {categorySuggestions.map((account, index) => (
                    <FilterChipButton
                      key={account.id}
                      testID={
                        index === 0
                          ? 'budget-category-suggestion-first'
                          : `budget-category-suggestion-${account.id}`
                      }
                      label={account.name}
                      accessibilityLabel={copy.chipAccessibility(account.name)}
                      onPress={() => addCategory(account.id)}
                    />
                  ))}
                </Inline>
              </Stack>
            )}
            <FilterChipButton
              testID="budget-category-add"
              icon={Icon.Plus}
              label={selectedCategories.length ? copy.addCategory : copy.allCategories}
              accessibilityLabel={copy.addCategories}
              onPress={() => setIsAccountPickerVisible(true)}
              style={styles.addChip}
            />
          </Stack>

          {spendingHistory.length > 0 ? (
            <FadeIn fromY={4} duration={180}>
              <BudgetSpendingHistoryChart
                periods={spendingHistory}
                limit={Number.parseFloat(amount) || 0}
                average={averageSpend}
                currencyCode={currencyCode}
              />
            </FadeIn>
          ) : null}

          <Stack gap="sm">
            <AppText variant="bodySmall" color="secondary" weight="medium">
              {amountLabel}
            </AppText>
            <Inline gap="sm" alignItems="center">
              <CurrencySideControl
                code={currencyCode}
                symbol={currencySymbol}
                onPress={() => setIsCurrencyPickerVisible(true)}
                accessibilityLabel={`${AppConfig.strings.accounts.selectCurrency}: ${currencyCode}`}
                testID="budget-currency"
              />
              <CalculatorAmountInput
                variant="hero"
                value={amount}
                onChangeText={setAmount}
                currency={currencyCode}
                currencySymbol={currencySymbol}
                showCurrencyPrefix={false}
                precision={precision}
                containerStyle={styles.amountInput}
                testID="hero-amount-input"
              />
            </Inline>
            {averageSpend != null ? (
              <SuggestionHint
                message={copy.yourAverage(formatMoney(averageSpend, currencyCode))}
                actionLabel={copy.useAverage}
                onAccept={useAverage}
                testID="budget-use-average"
              />
            ) : null}
          </Stack>
          <CurrencyPickerSheet
            visible={isCurrencyPickerVisible}
            currencies={currencies}
            selectedCurrency={currencyCode}
            onSelect={setCurrencyCode}
            onClose={() => setIsCurrencyPickerVisible(false)}
          />
        </Stack>
        <Stack gap="sm" paddingHorizontal="lg" marginTop="xl">
          <SectionLabel label={copy.settings} marginTop="none" />
          <ScheduleField
            value={schedule}
            startDate={scheduleStartDate}
            onChange={setSchedule}
            label={copy.resets}
            intervalTestIDPrefix="budget-interval-type-item-"
            testID="budget-schedule-field"
          />
        </Stack>
        <ListGroup variant="plain">
          <FormRow
            icon={Icon.Shield}
            title={copy.setAsideFrom}
            subtitle={copy.setAsideSubtitle}
            value={fundingLabel}
            onPress={() => setIsAssetPickerVisible(true)}
            testID="budget-set-aside-from"
          />
        </ListGroup>
      </EntityFormScreen>

      <MultiAccountPickerModal
        visible={isAccountPickerVisible}
        accounts={expenseAccounts}
        selectedIds={selectedAccountIds}
        title={copy.allCategories}
        onClose={() => setIsAccountPickerVisible(false)}
        onSelect={ids => {
          setSelectedAccountIds(ids);
          setIsAccountPickerVisible(false);
        }}
      />

      <MultiAccountPickerModal
        visible={isAssetPickerVisible}
        accounts={liquidAssetAccounts}
        selectedIds={assetAccountIds}
        title={copy.setAsideFrom}
        onClose={() => setIsAssetPickerVisible(false)}
        onSelect={ids => {
          setAssetAccountIds(ids);
          setIsAssetPickerVisible(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  amountInput: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  addChip: {
    alignSelf: 'flex-start',
  },
});
