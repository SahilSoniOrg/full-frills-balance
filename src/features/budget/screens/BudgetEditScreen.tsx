import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { AccountSelectionRow } from '@/src/components/common/AccountSelectionRow';
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen';
import { FormHeroSection } from '@/src/components/common/FormHeroSection';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { AppButton, LoadingView } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants';
import { Stack } from '@/src/design-system';
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
          amountLabel="Monthly Amount"
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

      <AccountPickerModal
        multiple
        visible={isAccountPickerVisible}
        accounts={expenseAccounts}
        selectedIds={selectedAccountIds}
        title="Select Scope Accounts"
        onClose={() => setIsAccountPickerVisible(false)}
        onSelect={ids => {
          setSelectedAccountIds(ids as string[]);
          setIsAccountPickerVisible(false);
        }}
      />

      <AccountPickerModal
        multiple
        visible={isAssetPickerVisible}
        accounts={liquidAssetAccounts}
        selectedIds={assetAccountIds}
        title="Select Asset Accounts"
        onClose={() => setIsAssetPickerVisible(false)}
        onSelect={ids => {
          setAssetAccountIds(ids as string[]);
          setIsAssetPickerVisible(false);
        }}
      />
    </>
  );
}
