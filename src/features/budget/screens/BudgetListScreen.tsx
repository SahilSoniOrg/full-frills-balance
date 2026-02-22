import { AppButton, AppCard, AppIcon, AppText, FloatingActionButton, IconButton } from '@/src/components/core'
import { Screen } from '@/src/components/layout'
import { Shape, Spacing } from '@/src/constants'
import { useTheme } from '@/src/hooks/use-theme'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import { AppNavigation } from '@/src/utils/navigation'
import React from 'react'
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native'
import { useBudgetListViewModel } from '../hooks/useBudgetListViewModel'
import { BudgetItem } from '../types'

export default function BudgetListScreen() {
    const { items } = useBudgetListViewModel()
    const { theme } = useTheme()

    const handlePress = (budgetId: string) => {
        AppNavigation.toBudgetDetail(budgetId)
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

        const isOver = usage.remaining < 0;

        return (
            <TouchableOpacity
                style={styles.cardContainer}
                onPress={() => handlePress(budget.id)}
                activeOpacity={0.8}
            >
                <AppCard elevation="md" padding="lg" radius="r2">
                    <View style={styles.cardHeader}>
                        <View style={styles.cardHeaderLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: theme.surfaceSecondary }]}>
                                <AppIcon name="pieChart" color={stripColor} size={20} />
                            </View>
                            <View>
                                <AppText variant="heading">{budget.name}</AppText>
                                {item.previousUsage && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                        <AppIcon
                                            name={item.previousUsage.remaining < 0 ? "error" : "checkCircle"}
                                            size={12}
                                            color={item.previousUsage.remaining < 0 ? theme.error : theme.success}
                                            style={{ marginRight: 4 }}
                                        />
                                        <AppText variant="caption" color={item.previousUsage.remaining < 0 ? 'error' : 'success'}>
                                            Last mo: {item.previousUsage.remaining < 0 ? 'Over budget' : 'Under budget'}
                                        </AppText>
                                    </View>
                                )}
                            </View>
                        </View>
                        <AppText variant="title">
                            {CurrencyFormatter.format(budget.amount, budget.currencyCode, { maximumFractionDigits: 0 })}
                        </AppText>
                    </View>

                    <View style={styles.statsContainer}>
                        <View style={styles.statColumn}>
                            <AppText variant="caption" color="secondary">Spent</AppText>
                            <AppText variant="body" style={{ marginTop: 4 }}>
                                {CurrencyFormatter.format(usage.spent, budget.currencyCode, { maximumFractionDigits: 0 })}
                            </AppText>
                        </View>
                        <View style={[styles.statColumn, { alignItems: 'flex-end' }]}>
                            <AppText variant="caption" color="secondary">
                                {isOver ? 'Over Limit' : 'Left'}
                            </AppText>
                            <View style={styles.remainingRow}>
                                {isOver && (
                                    <AppIcon name="alert" size={14} color={theme.error} style={{ marginRight: 4 }} />
                                )}
                                <AppText variant="body" color={isOver ? 'error' : 'success'}>
                                    {CurrencyFormatter.format(Math.abs(usage.remaining), budget.currencyCode, { maximumFractionDigits: 0 })}
                                </AppText>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: stripColor }]} />
                    </View>
                </AppCard>
            </TouchableOpacity>
        )
    }

    return (
        <Screen showBack={false}>
            <FlatList
                data={items}
                keyExtractor={item => item.budget.id}
                renderItem={renderItem}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                    <View style={styles.header}>
                        <View style={styles.summaryRow}>
                            <AppText variant="title" weight="bold">Budgets</AppText>
                            <IconButton
                                name="add"
                                size={24}
                                variant="surface"
                                onPress={() => AppNavigation.toBudgetForm()}
                            />
                        </View>
                    </View>
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <AppIcon name="pieChart" size={64} color={theme.border} />
                        <AppText variant="subheading" color="secondary" style={{ marginTop: Spacing.md }}>
                            No budgets yet
                        </AppText>
                        <AppButton
                            onPress={() => AppNavigation.toBudgetForm()}
                            style={{ marginTop: Spacing.lg }}
                        >
                            Create Budget
                        </AppButton>
                    </View>
                }
                contentContainerStyle={styles.listContainer}
            />
            <FloatingActionButton onPress={() => AppNavigation.toBudgetForm()} />
        </Screen>
    )
}

const styles = StyleSheet.create({
    cardContainer: {
        marginBottom: Spacing.md,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: Shape.radius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    statColumn: {
        justifyContent: 'center',
    },
    remainingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.xs,
    },
    progressTrack: {
        height: 6,
        borderRadius: Shape.radius.sm,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
    },
    header: {
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.lg,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    listContainer: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 80,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Spacing.xxxl,
    },
})
