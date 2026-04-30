import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FormHeroSection } from '@/src/components/common/FormHeroSection';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { MultiAccountPickerModal } from '@/src/components/common/MultiAccountPickerModal';
import { SectionLabel } from '@/src/components/common/SectionLabel';
import { AppButton, AppSegmentedControl, LoadingView } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { Box, FadeIn, Stack } from '@/src/design-system';
import { CurrencySelector } from '@/src/features/accounts';
import { useTheme } from '@/src/hooks/use-theme';
import { toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import React, { useState } from 'react';
import { useBudgetEditViewModel } from '../hooks/useBudgetEditViewModel';

export default function BudgetEditScreen() {
  const {
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
  } = useBudgetEditViewModel();
  const { theme } = useTheme();
  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isAssetPickerVisible, setIsAssetPickerVisible] = useState(false);

  if (loading) {
    return (
      <Screen
        title={AppConfig.strings.common.loading}
        headerActions={
          <AppButton variant="ghost" onPress={AppNavigation.back}>
            {AppConfig.strings.common.cancel}
          </AppButton>
        }
      >
        <LoadingView loading={true} text="Loading budget..." />
      </Screen>
    );
  }

  const handleSave = async () => {
    try {
      await save();
      toast.success('Budget saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save budget');
    }
  };

  return (
    <>
      <EntityFormScreen
        title={
          budget ? AppConfig.strings.budget.formTitleEdit : AppConfig.strings.budget.formTitleNew
        }
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
            intervalType === 'WEEKLY'
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
              <Box>
                <SectionLabel label="Interval" marginTop="none" />
                <AppSegmentedControl
                  flex
                  variant="minimal"
                  options={[
                    { label: 'Weekly', id: 'WEEKLY' },
                    { label: 'Monthly', id: 'MONTHLY' },
                    { label: 'Yearly', id: 'YEARLY' },
                  ]}
                  value={intervalType}
                  onChange={setIntervalType}
                />
              </Box>

              {intervalType === 'WEEKLY' && (
                <FadeIn fromY={5} duration={300}>
                  <Box>
                    <SectionLabel label="Budget Start Day" marginTop="none" />
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
                  </Box>
                </FadeIn>
              )}

              {intervalType === 'MONTHLY' && (
                <FadeIn fromY={5} duration={300}>
                  <Box>
                    <SectionLabel label="Budget Start Day" marginTop="none" />
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
                  </Box>
                </FadeIn>
              )}

              {intervalType === 'YEARLY' && (
                <FadeIn fromY={5} duration={300}>
                  <Stack space="lg">
                    <Box>
                      <SectionLabel label="Month" marginTop="none" />
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
                    </Box>

                    <Box>
                      <SectionLabel label="Budget Start Date" marginTop="none" />
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
                    </Box>
                  </Stack>
                </FadeIn>
              )}
            </Stack>
          </FormSectionGroup>

          <FormSectionGroup title="Accounts">
            <Stack space="md" paddingHorizontal="md">
              <AccountSelectionRow
                title="Target Accounts"
                accounts={expenseAccounts}
                selectedAccountIds={selectedAccountIds}
                placeholder="Select accounts"
                onPress={() => setIsAccountPickerVisible(true)}
                style={{
                  paddingHorizontal: 0,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              />

              <AccountSelectionRow
                title="Source Accounts"
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
        title="Select Scope Accounts"
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
        title="Select Asset Accounts"
        onClose={() => setIsAssetPickerVisible(false)}
        onSelect={ids => {
          setAssetAccountIds(ids);
          setIsAssetPickerVisible(false);
        }}
      />
    </>
  );
}
