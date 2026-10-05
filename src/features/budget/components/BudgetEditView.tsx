import { MultiAccountPickerModal } from '@/src/components/account-selection';
import {
  AppButton,
  AppIcon,
  AppText,
  Icon,
  Icon as CoreIcon,
  LoadingView,
} from '@/src/components/core';
import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { FormRow, ScheduleField, SuggestionHint, UnderlineNameField } from '@/src/components/forms';
import { FormSectionGroup } from '@/src/components/forms/FormSectionGroup';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { CurrencySelector } from '@/src/features/accounts';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { IvyPalette } from '@/src/constants/design-tokens';
import { budgetFormStrings as copy } from '@/src/constants/copy/domains/budgetFormStrings';
import { FadeIn, Stack } from '@/src/design-system';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useTheme } from '@/src/hooks/use-theme';
import { getCurrencyPrecision } from '@/src/utils/currencyPrecision';
import { toast } from '@/src/utils/alerts';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
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
  const { theme, themeMode } = useTheme();
  const formatMoney = useMoneyFormat();
  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isAssetPickerVisible, setIsAssetPickerVisible] = useState(false);
  const currency = currencies.find(item => item.code === currencyCode);
  const precision = currency?.precision ?? getCurrencyPrecision(currencyCode);
  const expenseInk = themeMode === 'light' ? IvyPalette.redDark : IvyPalette.redLight;

  const loadingChrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: AppConfig.strings.common.loading,
      showBack: true,
      backIcon: CoreIcon.Back,
      onBack: onCancel,
      headerActions: (
        <AppButton variant="ghost" onPress={onCancel}>
          {AppConfig.strings.common.cancel}
        </AppButton>
      ),
    }),
    [onCancel],
  );

  const formChrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: budget
        ? AppConfig.strings.budget.formTitleEdit
        : AppConfig.strings.budget.formTitleNew,
      showBack: true,
      backIcon: CoreIcon.Back,
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
        <Stack space="lg" paddingHorizontal="lg">
          <UnderlineNameField
            value={name}
            onChangeText={setName}
            placeholder={copy.namePlaceholder}
          />

          <FormSectionGroup title={copy.whatCounts} contentStyle={{ gap: Spacing.sm }}>
            {selectedCategories.length ? (
              <View
                testID="budget-selected-categories"
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}
              >
                {selectedCategories.map(account => (
                  <View
                    key={account.id}
                    testID={`budget-category-chip-${account.id}`}
                    style={{
                      minHeight: Size.touchTarget - Spacing.xs,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: Spacing.xs,
                      paddingHorizontal: Spacing.sm,
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
                    <Pressable
                      testID={`budget-category-remove-${account.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={copy.removeCategory(account.name)}
                      hitSlop={8}
                      onPress={() => removeCategory(account.id)}
                    >
                      <AppIcon name={Icon.Close} size={Size.iconXs} color={expenseInk} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <>
                <AppText variant="bodySmall" color="secondary">
                  {copy.whatCountsHint}
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {categorySuggestions.map(account => (
                    <Pressable
                      key={account.id}
                      testID={`budget-category-suggestion-${account.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={copy.chipAccessibility(account.name)}
                      onPress={() => addCategory(account.id)}
                      style={{
                        minHeight: Size.touchTarget - Spacing.xs,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: Spacing.xs,
                        paddingHorizontal: Spacing.sm,
                        borderRadius: Shape.radius.full,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <AppText variant="caption" color="secondary">
                        {account.name}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Pressable
              testID="budget-category-add"
              accessibilityRole="button"
              accessibilityLabel={copy.addCategories}
              onPress={() => setIsAccountPickerVisible(true)}
              style={{
                alignSelf: 'flex-start',
                minHeight: Size.touchTarget - Spacing.xs,
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.xs,
                paddingHorizontal: Spacing.sm,
                borderRadius: Shape.radius.full,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <AppIcon name={Icon.Plus} size={Size.iconXs} color={theme.textSecondary} />
              <AppText variant="caption" color="secondary">
                {selectedCategories.length ? copy.addCategory : copy.allCategories}
              </AppText>
            </Pressable>
          </FormSectionGroup>

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

          <View style={{ gap: Spacing.sm }}>
            <CalculatorAmountInput
              variant="centered"
              value={amount}
              onChangeText={setAmount}
              label={amountLabel}
              currencySymbol={currency?.symbol || currencyCode}
              precision={precision}
              testID="hero-amount-input"
            />
            <CurrencySelector
              variant="pill"
              selectedCurrency={currencyCode}
              currencies={currencies}
              onSelect={setCurrencyCode}
            />
            {averageSpend != null ? (
              <SuggestionHint
                message={copy.yourAverage(formatMoney(averageSpend, currencyCode))}
                actionLabel={copy.useAverage}
                onAccept={useAverage}
                testID="budget-use-average"
              />
            ) : null}
          </View>
        </Stack>
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.xl }}>
          <SectionLabel label={copy.settings} marginTop="none" />
          <ScheduleField
            value={schedule}
            startDate={scheduleStartDate}
            onChange={setSchedule}
            label={copy.resets}
            intervalTestIDPrefix="budget-interval-type-item-"
            testID="budget-schedule-field"
          />
        </View>
        <FormRow
          icon={Icon.Shield}
          title={copy.setAsideFrom}
          subtitle={copy.setAsideSubtitle}
          value={fundingLabel}
          onPress={() => setIsAssetPickerVisible(true)}
          testID="budget-set-aside-from"
        />
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
