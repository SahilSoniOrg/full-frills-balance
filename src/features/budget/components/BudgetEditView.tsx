import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FormHeroSection } from '@/src/components/common/FormHeroSection';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { FormField } from '@/src/components/common/FormField';
import { CurrencySelector, MultiAccountPickerModal } from '@/src/features/accounts';
import { AppButton, AppSegmentedControl, LoadingView } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { FadeIn, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { toast } from '@/src/utils/alerts';
import { useMemo, useState } from 'react';
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
  assetAccountIds,
  setAssetAccountIds,
  intervalType,
  setIntervalType,
  recurrenceDay,
  setRecurrenceDay,
  recurrenceMonth,
  setRecurrenceMonth,
  save,
  loading,
  isSaving,
  isFormValid,
  budget,
  onCancel,
}: BudgetEditViewModel) {
  const { theme } = useTheme();
  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isAssetPickerVisible, setIsAssetPickerVisible] = useState(false);

  const loadingChrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: AppConfig.strings.common.loading,
      showBack: true,
      backIcon: 'back',
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
      backIcon: 'back',
    }),
    [budget],
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
        edges={['top', 'bottom']}
        submitAction={{
          onPress: handleSave,
          disabled: !isFormValid || isSaving,
          label: budget
            ? isSaving
              ? 'Updating...'
              : 'Update Budget'
            : isSaving
              ? 'Creating...'
              : 'Create Budget',
        }}
      >
        <FormHeroSection
          nameLabel="Budget Name"
          nameValue={name}
          onNameChange={setName}
          amountLabel={
            intervalType === 'DAILY'
              ? 'Daily Amount'
              : intervalType === 'WEEKLY'
                ? 'Weekly Amount'
                : intervalType === 'YEARLY'
                  ? 'Yearly Amount'
                  : 'Monthly Amount'
          }
          amountValue={amount}
          onAmountChange={setAmount}
          footer={
            <CurrencySelector
              variant="pill"
              selectedCurrency={currencyCode}
              currencies={currencies}
              onSelect={setCurrencyCode}
            />
          }
        />

        <Stack space="xl" padding="lg">
          <FormSectionGroup title="Schedule">
            <Stack space="lg" paddingHorizontal="md">
              <FormField label="Interval">
                <AppSegmentedControl
                  scrollable
                  variant="minimal"
                  testID="budget-interval-type"
                  options={[
                    { label: 'Daily', id: 'DAILY' },
                    { label: 'Weekly', id: 'WEEKLY' },
                    { label: 'Monthly', id: 'MONTHLY' },
                    { label: 'Yearly', id: 'YEARLY' },
                  ]}
                  value={intervalType}
                  onChange={setIntervalType}
                />
              </FormField>

              {intervalType === 'WEEKLY' && (
                <FadeIn fromY={5} duration={300}>
                  <FormField label="Budget Start Day">
                    <AppSegmentedControl<number>
                      scrollable
                      variant="minimal"
                      size="sm"
                      options={AppConfig.strings.plannedPayments.dayNames.map((day, index) => ({
                        id: index,
                        label: day,
                      }))}
                      value={recurrenceDay}
                      onChange={setRecurrenceDay}
                    />
                  </FormField>
                </FadeIn>
              )}

              {intervalType === 'MONTHLY' && (
                <FadeIn fromY={5} duration={300}>
                  <FormField label="Budget Start Day">
                    <AppSegmentedControl<number>
                      scrollable
                      variant="minimal"
                      size="sm"
                      options={Array.from({ length: 31 }, (_, i) => i + 1).map(day => ({
                        id: day,
                        label: day.toString(),
                      }))}
                      value={recurrenceDay}
                      onChange={setRecurrenceDay}
                    />
                  </FormField>
                </FadeIn>
              )}

              {intervalType === 'YEARLY' && (
                <FadeIn fromY={5} duration={300}>
                  <Stack space="lg">
                    <FormField label="Month">
                      <AppSegmentedControl<number>
                        scrollable
                        variant="minimal"
                        size="sm"
                        options={AppConfig.strings.plannedPayments.monthNames.map(
                          (month, index) => ({
                            id: index + 1,
                            label: month,
                          }),
                        )}
                        value={recurrenceMonth}
                        onChange={setRecurrenceMonth}
                      />
                    </FormField>

                    <FormField label="Budget Start Date">
                      <AppSegmentedControl<number>
                        scrollable
                        variant="minimal"
                        size="sm"
                        options={Array.from({ length: 31 }, (_, i) => i + 1).map(day => ({
                          id: day,
                          label: day.toString(),
                        }))}
                        value={recurrenceDay}
                        onChange={setRecurrenceDay}
                      />
                    </FormField>
                  </Stack>
                </FadeIn>
              )}
            </Stack>
          </FormSectionGroup>

          <FormSectionGroup title="Scope">
            <Stack space="md" paddingHorizontal="md">
              <AccountSelectionRow
                title="Target Categories"
                accounts={expenseAccounts}
                selectedAccountIds={selectedAccountIds}
                placeholder="Select categories"
                onPress={() => setIsAccountPickerVisible(true)}
                style={{
                  paddingHorizontal: 0,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              />

              <AccountSelectionRow
                title="Funding Accounts"
                accounts={liquidAssetAccounts}
                selectedAccountIds={assetAccountIds}
                placeholder="Select accounts"
                onPress={() => setIsAssetPickerVisible(true)}
                style={{ paddingHorizontal: 0 }}
              />
            </Stack>
          </FormSectionGroup>
        </Stack>
      </EntityFormScreen>

      <MultiAccountPickerModal
        visible={isAccountPickerVisible}
        accounts={expenseAccounts}
        selectedIds={selectedAccountIds}
        title="Select Target Categories"
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
        title="Select Funding Accounts"
        onClose={() => setIsAssetPickerVisible(false)}
        onSelect={ids => {
          setAssetAccountIds(ids);
          setIsAssetPickerVisible(false);
        }}
      />
    </>
  );
}
