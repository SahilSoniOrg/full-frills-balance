import { AccountPickerModal } from '@/src/components/common/AccountPickerModal'
import { SubmitFooter } from '@/src/components/common/SubmitFooter'
import { AppButton, AppCard, AppText, ListRow } from '@/src/components/core'
import { AppInput } from '@/src/components/core/AppInput'
import { Screen, ScreenHeader } from '@/src/components/layout'
import { CurrencySelector } from '@/src/features/accounts';
import { router } from 'expo-router'
import React, { useState } from 'react'
import { confirm, toast } from '@/src/utils/alerts'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { useBudgetEditViewModel } from '../hooks/useBudgetEditViewModel'

export default function BudgetEditScreen() {
    const {
        expenseAccounts,
        name, setName,
        amount, setAmount,
        currencies, currencyCode, setCurrencyCode,
        selectedAccountIds, setSelectedAccountIds,
        save, deleteBudget,
        loading, isSaving, isFormValid, budget
    } = useBudgetEditViewModel()
    const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false)

    if (loading) {
        return (
            <Screen>
                <ScreenHeader
                    title="Loading..."
                    actions={
                        <AppButton variant="ghost" onPress={() => router.back()}>Cancel</AppButton>
                    }
                />
            </Screen>
        )
    }

    const handleDelete = () => {
        confirm.show({
            title: 'Delete Budget',
            message: 'Are you sure you want to delete this budget?', 
            confirmText: 'Delete',
            onConfirm: deleteBudget,
            destructive: true,
        })
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
        <Screen edges={['top', 'bottom']}>
            <ScreenHeader
                title={budget ? 'Edit Budget' : 'New Budget'}
                actions={
                    <AppButton variant="ghost" onPress={() => router.back()}>
                        Cancel
                    </AppButton>
                }
            />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                    <AppCard style={{ marginBottom: 24 }}>
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
                            style={{ marginTop: 16 }}
                        />
                        <AppText variant="body" style={{ marginTop: 16, marginBottom: 8 }}>Currency</AppText>
                        <CurrencySelector
                            selectedCurrency={currencyCode}
                            currencies={currencies}
                            onSelect={setCurrencyCode}
                        />
                    </AppCard>

                    <AppText variant="subheading" style={{ marginBottom: 12 }}>
                        Scope (Accounts)
                    </AppText>
                    <AppCard style={{ marginBottom: 32 }}>
                        <ListRow
                            title={selectedAccountIds.length > 0 ? `${selectedAccountIds.length} accounts selected` : 'Select accounts'}
                            subtitle="Choose which accounts this budget applies to"
                            onPress={() => setIsAccountPickerVisible(true)}
                        />
                    </AppCard>
                </ScrollView>
                <SubmitFooter
                    onPress={handleSave}
                    disabled={!isFormValid || isSaving}
                    label={budget ? (isSaving ? 'Updating...' : 'Update Budget') : (isSaving ? 'Creating...' : 'Create Budget')}
                    topSlot={
                        budget ? (
                            <AppButton
                                variant="ghost"
                                onPress={handleDelete}
                                disabled={isSaving}
                            >
                                Delete Budget
                            </AppButton>
                        ) : undefined
                    }
                />
            </KeyboardAvoidingView>

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
        </Screen>
    )
}
