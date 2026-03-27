import { AreaChart } from '@/src/components/charts/AreaChart';
import { BarChart } from '@/src/components/charts/BarChart';
import { CalendarHeatmap } from '@/src/components/charts/CalendarHeatmap';
import { HeatmapChart } from '@/src/components/charts/HeatmapChart';
import { LineChart } from '@/src/components/charts/LineChart';
import { SankeyChart } from '@/src/components/charts/SankeyChart';
import { AppCard, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT, REPORT_CHART_STRINGS } from '@/src/constants/report-constants';
import { BreakdownDonutCard } from '@/src/features/reports/components/BreakdownDonutCard';
import { ReportFilterBar } from '@/src/features/reports/components/ReportFilterBar';
import { ReportTabs } from '@/src/features/reports/components/ReportTabs';
import { IncomeExpenseTooltip, NetWorthTooltip } from '@/src/features/reports/components/ReportTooltip';
import { ReportsViewModel } from '@/src/features/reports/hooks/useReportsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useChartTooltipPosition } from '@/src/hooks/useChartTooltipPosition';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import React, { useCallback } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

const NET_WORTH_CHART_HEIGHT = REPORT_CHART_LAYOUT.netWorthChartHeight;
const BAR_CHART_HEIGHT = REPORT_CHART_LAYOUT.barChartHeight;
const BAR_SPACER_WIDTH = Spacing.xs;
const BALANCE_BAR_HEIGHT = Spacing.sm;

export function ReportsView(vm: ReportsViewModel) {
    const { theme } = useTheme();
    const {
        activeTab,
        setActiveTab,
        loading,
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
        expenseCategoryViewState,
        incomeCategoryViewState,
        expandedExpenseCategories,
        expandedIncomeCategories,
        toggleExpenseCategoryExpansion,
        toggleIncomeCategoryExpansion,
        sankeyData,
        spendingHeatmap,
        calendarHeatmap,
    } = vm;

    const { width } = useWindowDimensions();
    // Screen + Card padding = lg(16)*2 + lg(16)*2 = 64
    const CHART_WIDTH = width - (Spacing.lg * 4);
    const getNetWorthTooltipPosition = useChartTooltipPosition({
        containerWidth: CHART_WIDTH,
        containerHeight: NET_WORTH_CHART_HEIGHT,
    });
    const getBarTooltipPosition = useChartTooltipPosition({
        containerWidth: CHART_WIDTH,
        containerHeight: BAR_CHART_HEIGHT,
    });

    const renderNetWorthTooltip = useCallback(({ index, x, y }: { index: number; x: number; y: number }) => {
        const data = dailyData[index];
        if (!data) return null;

        const pos = getNetWorthTooltipPosition(x, y);
        const tooltipWidth = REPORT_CHART_LAYOUT.tooltipWidth;
        const tooltipHeight = REPORT_CHART_LAYOUT.netWorthTooltipHeight;

        const left = pos.showOnRight ? (x + pos.offset) : (x - tooltipWidth - pos.offset);
        const top = pos.showBelow ? (y + pos.offset) : (y - tooltipHeight - pos.offset);

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

        const pos = getBarTooltipPosition(x, y);
        const tooltipWidth = REPORT_CHART_LAYOUT.tooltipWidth;
        const tooltipHeight = REPORT_CHART_LAYOUT.barTooltipHeight;

        const left = pos.showOnRight ? (x + pos.offset) : (x - tooltipWidth - pos.offset);
        const top = pos.showBelow ? (y + pos.offset) : (y - tooltipHeight - pos.offset);

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

    const renderOverview = () => (
        <>
            <AppCard style={[styles.chartCard, { zIndex: selectedNetWorthIndex !== undefined ? 100 : 50, overflow: 'visible' }]} padding="lg">
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
            <AppCard style={[styles.chartCard, { zIndex: selectedIncomeExpenseIndex !== undefined ? 100 : 40, overflow: 'visible' }]} padding="lg">
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

            <AppCard style={[styles.chartCard, { zIndex: 30, overflow: 'visible' }]} padding="lg">
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

            <AppText variant="subheading" style={styles.sectionTitle}>Money Flow (Sankey)</AppText>
            <AppCard style={[styles.chartCard, { zIndex: 20, overflow: 'visible' }]} padding="lg">
                <SankeyChart
                    nodes={sankeyData.nodes}
                    links={sankeyData.links}
                    width={CHART_WIDTH}
                />
            </AppCard>
        </>
    );

    const renderSpending = () => (
        <>
            <AppText variant="subheading" style={styles.sectionTitle}>Spending by Category</AppText>
            {expenseCategoryViewState.hasData ? (
                <BreakdownDonutCard
                    donutData={expenseCategoryViewState.donutData}
                    legendRows={expenseCategoryViewState.legendRows}
                    totalCount={expenseCategoryViewState.totalCount}
                    showExpansionButton={expenseCategoryViewState.showExpansionButton}
                    expanded={expandedExpenseCategories}
                    onToggleExpansion={toggleExpenseCategoryExpansion}
                    onLegendRowPress={() => { }} // Category filtering not implemented
                />
            ) : (
                <AppCard padding="lg" style={[styles.chartCard, { zIndex: 18, overflow: 'visible' }]}>
                    <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                        {AppConfig.strings.reports.noData}
                    </AppText>
                </AppCard>
            )}

            <AppText variant="subheading" style={styles.sectionTitle}>Spending by Account</AppText>
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
                <AppCard padding="lg" style={[styles.chartCard, { zIndex: 17, overflow: 'visible' }]}>
                    <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                        {AppConfig.strings.reports.noData}
                    </AppText>
                </AppCard>
            )}

            {hasIncomeData && (
                <>
                    <AppText variant="subheading" style={styles.sectionTitle}>Income by Category</AppText>
                    {incomeCategoryViewState.hasData ? (
                        <BreakdownDonutCard
                            donutData={incomeCategoryViewState.donutData}
                            legendRows={incomeCategoryViewState.legendRows}
                            totalCount={incomeCategoryViewState.totalCount}
                            showExpansionButton={incomeCategoryViewState.showExpansionButton}
                            expanded={expandedIncomeCategories}
                            onToggleExpansion={toggleIncomeCategoryExpansion}
                            onLegendRowPress={() => { }}
                        />
                    ) : (
                        <AppCard padding="lg" style={[styles.chartCard, { zIndex: 16, overflow: 'visible' }]}>
                            <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                                {AppConfig.strings.reports.noData}
                            </AppText>
                        </AppCard>
                    )}

                    <AppText variant="subheading" style={styles.sectionTitle}>Income by Account</AppText>
                    <BreakdownDonutCard
                        donutData={incomeDonutData}
                        legendRows={incomeLegendRows}
                        totalCount={vm.totalIncomeCount}
                        showExpansionButton={vm.showIncomeExpansionButton}
                        expanded={vm.expandedIncome}
                        onToggleExpansion={vm.toggleIncomeExpansion}
                        onLegendRowPress={onLegendRowPress}
                    />
                </>
            )}

            <AppText variant="subheading" style={styles.sectionTitle}>Spending Heatmap (Density)</AppText>
            <AppCard style={[styles.chartCard, { zIndex: 15, overflow: 'visible' }]} padding="lg">
                <HeatmapChart
                    data={spendingHeatmap}
                    width={CHART_WIDTH}
                    height={240}
                    currency={vm.targetCurrency}
                />
                <AppText variant="caption" color="secondary" style={{ marginTop: Spacing.sm, textAlign: 'center' }}>
                    Darker cells indicate higher spending density (Day vs Hour)
                </AppText>
            </AppCard>

            {(() => {
                const isSingleMonth = vm.periodFilter.type === 'MONTH';
                const mainTitle = isSingleMonth ? "Monthly Spending Pattern" : "Spending Timeline";
                const chartTitle = isSingleMonth
                    ? `Daily intensity for ${vm.dateLabel}`
                    : `Spending flow over ${vm.dateLabel}`;

                return (
                    <>
                        <AppText variant="subheading" style={styles.sectionTitle}>{mainTitle}</AppText>
                        <AppCard style={[styles.chartCard, { zIndex: 10, overflow: 'visible' }]} padding="lg">
                            <CalendarHeatmap
                                data={calendarHeatmap}
                                width={CHART_WIDTH}
                                title={chartTitle}
                                currency={vm.targetCurrency}
                                onCellPress={(p) => p.timestamp && vm.onViewTransactions(p.timestamp)}
                            />
                        </AppCard>
                    </>
                );
            })()}
        </>
    );

    const getWealthTooltipPosition = useChartTooltipPosition({
        containerWidth: CHART_WIDTH,
        containerHeight: 200, // AreaChart height
        offset: 10,
    });

    const renderWealthTooltip = useCallback((index: number, x: number, y: number) => {
        const assetsPoint = vm.wealthAreaSeries[0][index];
        const liabilitiesPoint = vm.wealthAreaSeries[1][index];
        if (!assetsPoint || !liabilitiesPoint) return null;

        const pos = getWealthTooltipPosition(x, y);
        const tooltipWidth = REPORT_CHART_LAYOUT.tooltipWidth;
        const tooltipHeight = 85; // Standard NetWorthTooltip height

        const left = pos.showOnRight ? (x + pos.offset) : (x - tooltipWidth - pos.offset);
        const top = (200 - tooltipHeight) / 2; // Fixed vertical center

        return (
            <IncomeExpenseTooltip
                left={Math.max(Spacing.sm, Math.min(CHART_WIDTH - tooltipWidth - Spacing.sm, left))}
                top={top}
                backgroundColor={theme.surface}
                borderColor={theme.border}
                label={dayjs(assetsPoint.x).format('MMM D, YYYY')}
                income={assetsPoint.y}
                expense={liabilitiesPoint.y}
                successColor={theme.success}
                errorColor={theme.error}
                incomeLabel="Assets"
                expenseLabel="Liabilities"
                onViewTransactions={() => vm.onViewTransactions(assetsPoint.x, assetsPoint.x)}
            />
        );
    }, [vm.wealthAreaSeries, theme, CHART_WIDTH, vm.onViewTransactions, getWealthTooltipPosition]);

    const renderWealth = () => (
        <>
            <AppText variant="subheading" style={styles.sectionTitle}>Net Worth History</AppText>
            <AppCard style={[styles.chartCard, { zIndex: vm.selectedNetWorthIndex !== undefined ? 100 : 50, overflow: 'visible' }]} padding="lg">
                <View style={styles.headerRow}>
                    <View>
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

            <AppText variant="subheading" style={styles.sectionTitle}>Assets vs Liabilities</AppText>
            <AppCard style={[styles.chartCard, { zIndex: vm.selectedWealthIndex !== undefined ? 100 : 40, overflow: 'visible' }]} padding="lg">
                <AreaChart
                    series={vm.wealthAreaSeries}
                    colors={[theme.success, theme.error]}
                    width={CHART_WIDTH}
                    height={200}
                    selectedIndex={vm.selectedWealthIndex}
                    onPress={vm.onWealthPointSelect}
                    renderTooltip={renderWealthTooltip}
                />
                <View style={[styles.balanceRow, { marginTop: Spacing.md }]}>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
                        <AppText variant="caption">Total Assets</AppText>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
                        <AppText variant="caption">Total Liabilities</AppText>
                    </View>
                </View>
            </AppCard>
        </>
    );

    return (
        <Screen showBack={true} title={AppConfig.strings.reports.title} onBack={AppNavigation.back}>
            <ReportFilterBar {...vm} />
            <ReportTabs activeTab={activeTab} onTabChange={setActiveTab} />

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={theme.primary} />
                }
            >
                {activeTab === 'OVERVIEW' && renderOverview()}
                {activeTab === 'SPENDING' && renderSpending()}
                {activeTab === 'WEALTH' && renderWealth()}
            </ScrollView>
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
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: Spacing.xs,
    },
});
