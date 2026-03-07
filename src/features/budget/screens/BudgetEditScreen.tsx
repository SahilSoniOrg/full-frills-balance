import { AccountPickerModal } from '@/src/components/common/AccountPickerModal'
import { FormScreenScaffold } from '@/src/components/common/FormScreenScaffold'
import { SubmitFooter } from '@/src/components/common/SubmitFooter'
import { AppButton, AppCard, AppText, ListRow, LoadingView } from '@/src/components/core'
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
            <FormScreenScaffold
                title={budget ? 'Edit Budget' : 'New Budget'}
                edges={['top', 'bottom']}
                headerActions={
                    <AppButton variant="ghost" onPress={AppNavigation.back}>
                        {AppConfig.strings.common.cancel}
                    </AppButton>
                }
                contentContainerStyle={{ padding: Spacing.lg }}
                footerSlot={
                    <SubmitFooter
                        onPress={handleSave}
                        disabled={!isFormValid || isSaving}
                        label={budget ? (isSaving ? 'Updating...' : 'Update Budget') : (isSaving ? 'Creating...' : 'Create Budget')}
                        topSlot={undefined}
                    />
                }
            >
                <AppCard style={{ marginBottom: Spacing.xxl }}>
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
                </AppCard>

                <AppText variant="subheading" style={{ marginBottom: Spacing.md }}>
                    Scope (Accounts)
                </AppText>
                <AppCard style={{ marginBottom: Spacing.xxxl }}>
                    <ListRow
                        title={selectedAccountIds.length > 0 ? `${selectedAccountIds.length} accounts selected` : 'Select accounts'}
                        subtitle="Choose which accounts this budget applies to"
                        onPress={() => setIsAccountPickerVisible(true)}
                    />
                </AppCard>
            </FormScreenScaffold>

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
