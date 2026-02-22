import { AppButton, AppCard, AppText } from '@/src/components/core'
import { AppInput } from '@/src/components/core/AppInput'
import { Screen, ScreenHeader } from '@/src/components/layout'
import { CurrencySelector } from '@/src/features/accounts/components/CurrencySelector'
import { useTheme } from '@/src/hooks/use-theme'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'
import { Alert, ScrollView, Switch, View } from 'react-native'
import { useBudgetEditViewModel } from '../hooks/useBudgetEditViewModel'

export default function BudgetEditScreen() {
    const params = useLocalSearchParams<{ id?: string }>()
    const { theme } = useTheme()
    const {
        expenseAccounts,
        name, setName,
        amount, setAmount,
        currencies, currencyCode, setCurrencyCode,
        selectedAccountIds, toggleAccount,
        save, deleteBudget,
        loading, isSaving, isFormValid, budget
    } = useBudgetEditViewModel(params.id)

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
        Alert.alert('Delete Budget', 'Are you sure you want to delete this budget?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: deleteBudget }
        ])
    }

    const handleSave = async () => {
        try {
            await save()
        } catch (e: any) {
            Alert.alert('Error', e.message)
        }
    }

    return (
        <Screen>
            <ScreenHeader
                title={budget ? 'Edit Budget' : 'New Budget'}
                actions={
                    <AppButton variant="ghost" onPress={() => router.back()}>
                        Cancel
                    </AppButton>
                }
            />
            <ScrollView contentContainerStyle={{ padding: 16 }}>
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
                    {expenseAccounts.map(account => (
                        <View
                            key={account.id}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingVertical: 12,
                                borderBottomWidth: 1,
                                borderBottomColor: theme.border
                            }}
                        >
                            <AppText>{account.name}</AppText>
                            <Switch
                                value={selectedAccountIds.includes(account.id)}
                                onValueChange={() => toggleAccount(account.id)}
                                trackColor={{ true: theme.primary }}
                            />
                        </View>
                    ))}
                </AppCard>

                <AppButton
                    onPress={handleSave}
                    disabled={!isFormValid || isSaving}
                    loading={isSaving}
                    style={{ marginBottom: 16 }}
                >
                    Save Budget
                </AppButton>

                {budget && (
                    <AppButton
                        variant="ghost"
                        onPress={handleDelete}
                        disabled={isSaving}
                    >
                        Delete Budget
                    </AppButton>
                )}
            </ScrollView>
        </Screen>
    )
}
