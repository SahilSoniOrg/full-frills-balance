import { AppButton, AppCard, AppIcon, AppText, FloatingActionButton } from '@/src/components/core'
import { Screen, ScreenHeader } from '@/src/components/layout'
import { useTheme } from '@/src/hooks/use-theme'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import { router } from 'expo-router'
import React from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import { useBudgetListViewModel } from '../hooks/useBudgetListViewModel'
import { BudgetItem } from '../types'

export default function BudgetListScreen() {
    const { items } = useBudgetListViewModel()
    const { theme } = useTheme()

    const handleEdit = (budgetId: string) => {
        router.push({
            pathname: '/edit-budget',
            params: { id: budgetId }
        })
    }

    const renderItem = ({ item }: { item: BudgetItem }) => {
        const { budget, usage } = item
        const progress = Math.min(100, Math.max(0, usage.usagePercent * 100))

        let stripColor = theme.primary
        if (usage.usagePercent >= 1) {
            stripColor = theme.error
        } else if (usage.usagePercent >= 0.8) {
            stripColor = theme.warning
        }

        return (
            <TouchableOpacity
                style={{ marginBottom: 16 }}
                onPress={() => handleEdit(budget.id)}
                activeOpacity={0.8}
            >
                <AppCard>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <AppText variant="subheading">{budget.name}</AppText>
                        <AppText variant="subheading">
                            {CurrencyFormatter.format(budget.amount, budget.currencyCode)}
                        </AppText>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                        <AppText variant="caption" color="secondary">
                            {CurrencyFormatter.format(usage.spent, budget.currencyCode)} spent
                        </AppText>
                        <AppText variant="caption" color={usage.remaining < 0 ? 'error' : 'secondary'}>
                            {CurrencyFormatter.format(Math.abs(usage.remaining), budget.currencyCode)} {usage.remaining < 0 ? 'over' : 'left'}
                        </AppText>
                    </View>

                    <View style={{ height: 6, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${progress}%`, backgroundColor: stripColor }} />
                    </View>
                </AppCard>
            </TouchableOpacity>
        )
    }

    return (
        <Screen>
            <ScreenHeader
                title="Budgets"
                actions={
                    <AppButton
                        variant="ghost"
                        onPress={() => router.push('/edit-budget')}
                    >
                        <AppIcon name="plus" size={24} color={theme.primary} />
                    </AppButton>
                }
            />
            <View style={{ flex: 1, padding: 16 }}>
                {items.length === 0 ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <AppIcon name="pie-chart" size={64} color={theme.border} />
                        <AppText variant="subheading" color="secondary" style={{ marginTop: 16 }}>
                            No budgets yet
                        </AppText>
                        <AppButton
                            onPress={() => router.push('/edit-budget')}
                            style={{ marginTop: 24 }}
                        >
                            Create Budget
                        </AppButton>
                    </View>
                ) : (
                    <FlatList
                        data={items}
                        keyExtractor={item => item.budget.id}
                        renderItem={renderItem}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 80 }}
                    />
                )}
            </View>
            <FloatingActionButton onPress={() => router.push('/edit-budget')} />
        </Screen>
    )
}
