import { BarChart } from '@/src/components/charts/BarChart';
import { LineChart } from '@/src/components/charts/LineChart';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT, REPORT_CHART_STRINGS } from '@/src/constants/report-constants';
import { BreakdownDonutCard } from '@/src/features/reports/components/BreakdownDonutCard';
import { IncomeExpenseTooltip, NetWorthTooltip } from '@/src/features/reports/components/ReportTooltip';
import { useChartTooltipPosition } from '@/src/features/reports/hooks/useChartTooltipPosition';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';

const NET_WORTH_CHART_HEIGHT = REPORT_CHART_LAYOUT.netWorthChartHeight;
const BAR_CHART_HEIGHT = REPORT_CHART_LAYOUT.barChartHeight;
const BAR_SPACER_WIDTH = Spacing.xs;
const BALANCE_BAR_HEIGHT = Spacing.sm;

export function ReportsView(vm: ReportsViewModel) {
    const { theme } = useTheme();
    const {
        showDatePicker,
        onOpenDatePicker,
        onCloseDatePicker,
        onDateSelect,
        dateLabel,
        loading,
        periodFilter,
        onRefresh,
        netWorthSeries,
        incomeBarFlex,
        expenseBarFlex,
        expenseDonutData,
        incomeDonutData,
        legendRows,
        incomeLegendRows,
        hasExpenseData,
        hasIncomeData,
        barChartData,
        selectedNetWorthIndex,
        onNetWorthPointSelect,
        selectedIncomeExpenseIndex,
        onIncomeExpensePointSelect,
        displayedNetWorthText,
        displayedIncomeText,
        displayedExpenseText,
        dailyData,
        onViewTransactions,
        onLegendRowPress,
    } = vm;

    const { width } = useWindowDimensions();
    // Screen + Card padding = lg(16)*2 + lg(16)*2 = 64
    const CHART_WIDTH = width - (Spacing.lg * 4);
    const getNetWorthTooltipPosition = useChartTooltipPosition({
        containerWidth: CHART_WIDTH,
        containerHeight: NET_WORTH_CHART_HEIGHT,
        tooltipWidth: REPORT_CHART_LAYOUT.tooltipWidth,
        tooltipHeight: REPORT_CHART_LAYOUT.netWorthTooltipHeight,
    });
    const getBarTooltipPosition = useChartTooltipPosition({
        containerWidth: CHART_WIDTH,
        containerHeight: BAR_CHART_HEIGHT,
        tooltipWidth: REPORT_CHART_LAYOUT.tooltipWidth,
        tooltipHeight: REPORT_CHART_LAYOUT.barTooltipHeight,
    });

    const renderNetWorthTooltip = useCallback(({ index, x, y }: { index: number; x: number; y: number }) => {
        const data = dailyData[index];
        if (!data) return null;
        const { left, top } = getNetWorthTooltipPosition(x, y);

        return (
            <NetWorthTooltip
                left={left}
                top={top}
                backgroundColor={theme.surface}
                borderColor={theme.border}
                date={data.date}
                netWorth={data.netWorth}
                income={data.income}
                expense={data.expense}
                successColor={theme.success}
                errorColor={theme.error}
                onViewTransactions={() => onViewTransactions(data.date)}
                incomeLabel={REPORT_CHART_STRINGS.incomeShort}
                expenseLabel={REPORT_CHART_STRINGS.expenseShort}
            />
        );
    }, [dailyData, theme, getNetWorthTooltipPosition, onViewTransactions]);

    const renderBarTooltip = useCallback(({ index, x, y }: { index: number; x: number; y: number }) => {
        const data = barChartData[index];
        if (!data) return null;
        const { left, top } = getBarTooltipPosition(x, y);

        return (
            <IncomeExpenseTooltip
                left={left}
                top={top}
                backgroundColor={theme.surface}
                borderColor={theme.border}
                label={data.label}
                income={data.values[0]}
                expense={data.values[1]}
                successColor={theme.success}
                errorColor={theme.error}
                onViewTransactions={vm.onViewSelectedTransactions}
                incomeLabel={REPORT_CHART_STRINGS.incomeShort}
                expenseLabel={REPORT_CHART_STRINGS.expenseShort}
            />
        );
    }, [barChartData, theme, getBarTooltipPosition, vm.onViewSelectedTransactions]);

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
                            <AppText variant="heading">{displayedNetWorthText}</AppText>
                        </View>
                    </View>

                    <View style={styles.chartContainer}>
                        <LineChart
                            data={netWorthSeries}
                            height={NET_WORTH_CHART_HEIGHT}
                            color={theme.primary}
                            width={CHART_WIDTH}
                            onPress={onNetWorthPointSelect}
                            selectedIndex={selectedNetWorthIndex}
                            renderTooltip={renderNetWorthTooltip}
                        />
                    </View>
                </AppCard>

                <AppText variant="subheading" style={styles.sectionTitle}>{AppConfig.strings.reports.incomeVsExpenseTrend}</AppText>
                <AppCard style={styles.chartCard} padding="lg">
                    <View style={styles.chartContainer}>
                        <BarChart
                            data={barChartData}
                            height={BAR_CHART_HEIGHT}
                            width={CHART_WIDTH}
                            onPress={onIncomeExpensePointSelect}
                            selectedIndex={selectedIncomeExpenseIndex}
                            renderTooltip={renderBarTooltip}
                        />
                    </View>
                </AppCard>

                {hasIncomeData && (
                    <BreakdownDonutCard
                        title={AppConfig.strings.reports.incomeBreakdown}
                        donutData={incomeDonutData}
                        legendRows={incomeLegendRows}
                        totalCount={vm.totalIncomeCount}
                        showExpansionButton={vm.showIncomeExpansionButton}
                        expanded={vm.expandedIncome}
                        onToggleExpansion={vm.toggleIncomeExpansion}
                        onLegendRowPress={onLegendRowPress}
                    />
                )}

                <AppText variant="subheading" style={styles.sectionTitle}>{AppConfig.strings.reports.spendingBreakdown}</AppText>

                <AppCard style={styles.chartCard} padding="lg">
                    <View style={styles.balanceRow}>
                        <View style={styles.balanceItem}>
                            <AppText variant="caption" color="secondary">{AppConfig.strings.reports.totalIncome}</AppText>
                            <AppText variant="subheading" style={{ color: theme.success }}>{displayedIncomeText}</AppText>
                        </View>
                        <View style={[styles.divider, { backgroundColor: theme.border }]} />
                        <View style={styles.balanceItem}>
                            <AppText variant="caption" color="secondary">{AppConfig.strings.reports.totalExpense}</AppText>
                            <AppText variant="subheading" style={{ color: theme.error }}>{displayedExpenseText}</AppText>
                        </View>
                    </View>
                    <View style={styles.barContainer}>
                        <View style={[styles.bar, { flex: incomeBarFlex, backgroundColor: theme.success }]} />
                        <View style={{ width: BAR_SPACER_WIDTH }} />
                        <View style={[styles.bar, { flex: expenseBarFlex, backgroundColor: theme.error }]} />
                    </View>
                </AppCard>

                {hasExpenseData ? (
                    <BreakdownDonutCard
                        donutData={expenseDonutData}
                        legendRows={legendRows}
                        totalCount={vm.totalExpenseCount}
                        showExpansionButton={vm.showExpenseExpansionButton}
                        expanded={vm.expandedExpenses}
                        onToggleExpansion={vm.toggleExpenseExpansion}
                        onLegendRowPress={onLegendRowPress}
                    />
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
    balanceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    balanceItem: {
        flex: 1,
    },
    divider: {
        width: StyleSheet.hairlineWidth,
        marginHorizontal: Spacing.md,
    },
    barContainer: {
        flexDirection: 'row',
        height: BALANCE_BAR_HEIGHT,
        borderRadius: Shape.radius.xs,
        overflow: 'hidden',
    },
    bar: {
        height: '100%',
        borderRadius: Shape.radius.xs,
    },
});
