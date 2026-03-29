import { AccountPickerModal } from '@/src/components/common/AccountPickerModal'
import { EntityFormScreen } from '@/src/components/common/EntityFormScreen'
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup'
import { AppButton, AppText, ListRow, LoadingView } from '@/src/components/core'
import { AppInput } from '@/src/components/core/AppInput'
import { Screen } from '@/src/components/layout'
import { AppConfig, Spacing } from '@/src/constants'
import { CurrencySelector } from '@/src/features/accounts'
import { toast } from '@/src/utils/alerts'
import { AppNavigation } from '@/src/utils/navigation'
import React, { useState } from 'react'
import { useBudgetEditViewModel } from '../hooks/useBudgetEditViewModel'

export default function BudgetEditScreen() {
    const {
        expenseAccounts,
        name, setName,
        amount, setAmount,
        currencies, currencyCode, setCurrencyCode,
        selectedAccountIds, setSelectedAccountIds,
        save,
        loading, isSaving, isFormValid, budget
    } = useBudgetEditViewModel()
    const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false)

    if (loading) {
        return (
            <Screen
                title={AppConfig.strings.common.loading}
                headerActions={<AppButton variant="ghost" onPress={AppNavigation.back}>{AppConfig.strings.common.cancel}</AppButton>}
            >
                <LoadingView loading={true} text="Loading budget..." />
            </Screen>
        )
    }


    const handleSave = async () => {
        try {
            await save()
            toast.success('Budget saved')
        } catch (e: any) {
            toast.error(e.message || 'Failed to save budget')
        }
    }

    return (
        <>
            <EntityFormScreen
                title={budget ? 'Edit Budget' : 'New Budget'}
                edges={['top', 'bottom']}
                headerActions={
                    <AppButton variant="ghost" onPress={AppNavigation.back}>
                        {AppConfig.strings.common.cancel}
                    </AppButton>
                }
                contentContainerStyle={{ padding: Spacing.lg }}
                submitAction={{
                    onPress: handleSave,
                    disabled: !isFormValid || isSaving,
                    label: budget ? (isSaving ? 'Updating...' : 'Update Budget') : (isSaving ? 'Creating...' : 'Create Budget'),
                }}
            >
                <FormSectionGroup title="Budget Details">
                    <AppInput
                        label="Budget Name"
                        value={name}
                        onChangeText={setName}
                        placeholder="e.g., Groceries"
                        autoCapitalize="words"
                    />
                    <AppInput
                        label="Monthly Amount"
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        style={{ marginTop: Spacing.lg }}
                    />
                    <AppText variant="body" style={{ marginTop: Spacing.lg, marginBottom: Spacing.sm }}>Currency</AppText>
                    <CurrencySelector
                        selectedCurrency={currencyCode}
                        currencies={currencies}
                        onSelect={setCurrencyCode}
                    />
                </FormSectionGroup>

                <FormSectionGroup title="Scope (Accounts)">
                    <ListRow
                        title={selectedAccountIds.length > 0 ? `${selectedAccountIds.length} accounts selected` : 'Select accounts'}
                        subtitle="Choose which accounts this budget applies to"
                        onPress={() => setIsAccountPickerVisible(true)}
                    />
                </FormSectionGroup>
            </EntityFormScreen>

            <AccountPickerModal
                multiple
                visible={isAccountPickerVisible}
                accounts={expenseAccounts}
                selectedIds={selectedAccountIds}
                title="Select Scope Accounts"
                onClose={() => setIsAccountPickerVisible(false)}
                onSelect={(ids) => {
                    setSelectedAccountIds(ids as string[]);
                    setIsAccountPickerVisible(false);
                }}
            />
        </>
    )
}
