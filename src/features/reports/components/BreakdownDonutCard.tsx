import { DonutChart } from '@/src/components/charts/DonutChart';
import { AppCard, AppText } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface LegendRow {
    id: string;
    color: string;
    accountName: string;
    percentage: number;
    amount: number;
}

interface BreakdownDonutCardProps {
    title?: string;
    donutData: { value: number; color: string; label: string }[];
    legendRows: LegendRow[];
    totalCount: number;
    showExpansionButton: boolean;
    expanded: boolean;
    onToggleExpansion: () => void;
    onLegendRowPress: (accountId: string) => void;
    donutSize?: number;
    donutStrokeWidth?: number;
}

const DEFAULT_DONUT_SIZE = REPORT_CHART_LAYOUT.donutSize;
const DEFAULT_DONUT_STROKE_WIDTH = REPORT_CHART_LAYOUT.donutStrokeWidth;

export function BreakdownDonutCard({
    title,
    donutData,
    legendRows,
    totalCount,
    showExpansionButton,
    expanded,
    onToggleExpansion,
    onLegendRowPress,
    donutSize = DEFAULT_DONUT_SIZE,
    donutStrokeWidth = DEFAULT_DONUT_STROKE_WIDTH,
}: BreakdownDonutCardProps) {
    return (
        <>
            {title && <AppText variant="subheading" style={styles.sectionTitle}>{title}</AppText>}
            <AppCard style={styles.chartCard} padding="lg">
                <View style={styles.donutContainer}>
                    <DonutChart data={donutData} size={donutSize} strokeWidth={donutStrokeWidth} />
                    <View style={styles.legend}>
                        {legendRows.map((row) => (
                            <TouchableOpacity
                                key={row.id}
                                style={styles.legendItem}
                                onPress={() => onLegendRowPress(row.id)}
                                activeOpacity={REPORT_CHART_LAYOUT.donutLegendRowActiveOpacity}
                            >
                                <View style={[styles.dot, { backgroundColor: row.color }]} />
                                <View style={styles.legendNameWrap}>
                                    <AppText variant="caption" numberOfLines={1}>{row.accountName}</AppText>
                                </View>
                                <View style={styles.legendValueWrap}>
                                    <AppText variant="body" weight="bold">{row.percentage}%</AppText>
                                    <AppText variant="caption" color="secondary" style={styles.amountText}>
                                        {CurrencyFormatter.formatWithPreference(row.amount)}
                                    </AppText>
                                </View>
                            </TouchableOpacity>
                        ))}
                        {showExpansionButton && (
                            <TouchableOpacity onPress={onToggleExpansion} style={styles.showMoreButton}>
                                <AppText variant="caption" color="primary">
                                    {expanded
                                        ? AppConfig.strings.reports.showLess
                                        : AppConfig.strings.reports.showAll(totalCount)}
                                </AppText>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </AppCard>
        </>
    );
}

const styles = StyleSheet.create({
    sectionTitle: {
        marginBottom: Spacing.md,
    },
    chartCard: {
        marginBottom: Spacing.xl,
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
    legendNameWrap: {
        flex: 1,
        marginRight: Spacing.sm,
    },
    legendValueWrap: {
        alignItems: 'flex-end',
    },
    amountText: {
        fontSize: REPORT_CHART_LAYOUT.donutLegendRowAmountFontSize,
    },
    showMoreButton: {
        alignItems: 'center',
        paddingVertical: Spacing.sm,
        marginTop: Spacing.sm,
    },
});
