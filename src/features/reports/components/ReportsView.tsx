import { DonutChart } from '@/src/components/charts/DonutChart';
import { LineChart } from '@/src/components/charts/LineChart';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import type { ExpenseCategory } from '@/src/services/report-service';
import type { DailyNetWorth } from '@/src/services/wealth-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export function ReportsView(vm: ReportsViewModel) {
    const { theme } = useTheme();
    const {
        showDatePicker,
        onOpenDatePicker,
        onCloseDatePicker,
        onDateSelect,
        dateLabel,
        loading,
        netWorthHistory,
        expenses,
        incomeVsExpense,
        currentNetWorth,
        periodFilter,
        onRefresh,
    } = vm;

    return (
        <Screen showBack={false}>
            <View style={styles.filterBar}>
                <TouchableOpacity
                    style={[styles.filterButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                    onPress={onOpenDatePicker}
                >
                    <AppIcon name="calendar" size={Size.iconSm} color={theme.textSecondary} />
                    <AppText variant="caption" style={{ marginLeft: Spacing.xs }}>
                        {dateLabel}
                    </AppText>
                    <AppIcon name="chevronDown" size={Size.iconSm} color={theme.textSecondary} style={{ marginLeft: Spacing.xs }} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={theme.primary} />
                }
            >
                <AppCard style={styles.chartCard} padding="lg">
                    <View style={styles.headerRow}>
                        <View>
                            <AppText variant="caption" color="secondary">{AppConfig.strings.reports.netWorthChange}</AppText>
                            <AppText variant="heading">
                                {CurrencyFormatter.formatWithPreference(currentNetWorth)}
                            </AppText>
                        </View>
                    </View>

                    <View style={styles.chartContainer}>
                        <LineChart
                            data={netWorthHistory.map((d: DailyNetWorth) => ({ x: d.date, y: d.netWorth }))}
                            height={180}
                            color={theme.primary}
                        />
                    </View>
                </AppCard>

                <AppText variant="subheading" style={styles.sectionTitle}>{AppConfig.strings.reports.spendingBreakdown}</AppText>

                <AppCard style={styles.chartCard} padding="lg">
                    <View style={styles.balanceRow}>
                        <View style={styles.balanceItem}>
                            <AppText variant="caption" color="secondary">{AppConfig.strings.reports.totalIncome}</AppText>
                            <AppText variant="subheading" style={{ color: theme.success }}>
                                {CurrencyFormatter.formatWithPreference(incomeVsExpense.income)}
                            </AppText>
                        </View>
                        <View style={[styles.divider, { backgroundColor: theme.border }]} />
                        <View style={styles.balanceItem}>
                            <AppText variant="caption" color="secondary">{AppConfig.strings.reports.totalExpense}</AppText>
                            <AppText variant="subheading" style={{ color: theme.error }}>
                                {CurrencyFormatter.formatWithPreference(incomeVsExpense.expense)}
                            </AppText>
                        </View>
                    </View>
                    <View style={styles.barContainer}>
                        <View style={[styles.bar, { flex: incomeVsExpense.income || 1, backgroundColor: theme.success }]} />
                        <View style={{ width: 4 }} />
                        <View style={[styles.bar, { flex: incomeVsExpense.expense || 1, backgroundColor: theme.error }]} />
                    </View>
                </AppCard>

                {expenses.length > 0 ? (
                    <AppCard style={styles.chartCard} padding="lg">
                        <View style={styles.donutContainer}>
                            <DonutChart
                                data={expenses.map((e: ExpenseCategory) => ({ value: e.amount, color: e.color || theme.text, label: e.accountName }))}
                                size={160}
                                strokeWidth={25}
                            />
                            <View style={styles.legend}>
                                {expenses.slice(0, 5).map((e: ExpenseCategory) => (
                                    <View key={e.accountId} style={styles.legendItem}>
                                        <View style={[styles.dot, { backgroundColor: e.color }]} />
                                        <View style={{ flex: 1, marginRight: Spacing.sm }}>
                                            <AppText variant="caption" numberOfLines={1}>{e.accountName}</AppText>
                                        </View>
                                        <AppText variant="body" weight="bold">{Math.round(e.percentage)}%</AppText>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </AppCard>
                ) : (
                    <AppCard padding="lg">
                        <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                            {AppConfig.strings.reports.noData}
                        </AppText>
                    </AppCard>
                )}

            </ScrollView>

            <DateRangePicker
                visible={showDatePicker}
                onClose={onCloseDatePicker}
                onSelect={onDateSelect}
                currentFilter={periodFilter}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        padding: Spacing.lg,
        paddingBottom: Size.xxl * 2,
    },
    filterBar: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.sm,
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderRadius: Shape.radius.full,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
    },
    chartCard: {
        marginBottom: Spacing.xl,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    chartContainer: {
        marginTop: Spacing.sm,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
    },
    donutContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    legend: {
        flex: 1,
        marginLeft: Spacing.lg,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    dot: {
        width: Spacing.sm,
        height: Spacing.sm,
        borderRadius: Shape.radius.full,
        marginRight: Spacing.sm,
    },
    balanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    balanceItem: {
        flex: 1,
    },
    divider: {
        width: 1,
        marginHorizontal: Spacing.md,
    },
    barContainer: {
        flexDirection: 'row',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
    },
    bar: {
        height: '100%',
        borderRadius: 4,
    }
});
