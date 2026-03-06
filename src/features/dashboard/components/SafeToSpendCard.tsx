import { LineChart } from '@/src/components/charts/LineChart';
import { PopupModal } from '@/src/components/common/PopupModal';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { AccountSubtype, formatAccountSubtypeLabel } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { SafeToSpendProjection } from '@/src/services/insight-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface SafeToSpendCardProps {
    safeToSpend: number;
    projection?: SafeToSpendProjection;
    committedBudget: number;
    committedPlanned: number;
    committedLiabilities: number;
    committedPlannedPayments: number;
    committedPlannedJournals: number;
    totalFutureInflow: number;
    totalLiquidAssets: number;
    totalLiabilities: number;
    totalLiabilitiesCC: number;
    totalLiabilitiesOther: number;
    currencyCode: string;
    liquidAssetSubtypes: AccountSubtype[];
    liquidLiabilitySubtypes: AccountSubtype[];
    budgetSubtypes: AccountSubtype[];
    liquidAssetAccountNames: string[];
    liquidLiabilityAccountNames: string[];
    budgetAccountNames: string[];
    isLoading?: boolean;
}

export const SafeToSpendCard = ({
    safeToSpend,
    projection,
    committedBudget,
    committedPlanned,
    committedLiabilities,
    committedPlannedPayments,
    committedPlannedJournals,
    totalFutureInflow,
    totalLiquidAssets,
    totalLiabilities,
    totalLiabilitiesCC,
    totalLiabilitiesOther,
    currencyCode,
    liquidAssetSubtypes,
    liquidLiabilitySubtypes,
    budgetSubtypes,
    liquidAssetAccountNames,
    liquidLiabilityAccountNames,
    budgetAccountNames,
    isLoading = false
}: SafeToSpendCardProps) => {
    const { theme, fonts } = useTheme();
    const [isInfoVisible, setInfoVisible] = React.useState(false);
    const [selectedLegendItem, setSelectedLegendItem] = React.useState<'safe' | 'committed' | 'debts' | null>(null);
    const info = AppConfig.strings.dashboard.safeToSpendExplanation;

    const format = (val: number) => {
        if (isLoading) return '...';
        return CurrencyFormatter.format(val, currencyCode, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    };

    const renderSubtypeGroup = (
        title: string,
        subtitle: string,
        subtypes: AccountSubtype[],
        accountNames: string[]
    ) => (
        <View style={styles.modalSection}>
            <AppText variant="body" weight="bold">{title}</AppText>
            <AppText variant="caption" color="secondary" style={styles.modalSectionHint}>
                {subtitle}
            </AppText>
            <View style={styles.modalMetaGroup}>
                <AppText variant="caption" weight="bold">Categories used</AppText>
                {subtypes.length > 0 ? (
                    <AppText variant="caption" color="secondary" style={styles.modalSectionValue}>
                        {subtypes.map(formatAccountSubtypeLabel).join(', ')}
                    </AppText>
                ) : (
                    <AppText variant="caption" color="secondary" style={styles.modalSectionValue}>
                        None detected yet
                    </AppText>
                )}
            </View>
            <View style={styles.modalMetaGroup}>
                <AppText variant="caption" weight="bold">Accounts used</AppText>
                {accountNames.length > 0 ? (
                    <AppText variant="caption" color="secondary" style={styles.modalSectionValue}>
                        {accountNames.join(', ')}
                    </AppText>
                ) : (
                    <AppText variant="caption" color="secondary" style={styles.modalSectionValue}>
                        None detected yet
                    </AppText>
                )}
            </View>
        </View>
    );

    // committedTotal represents planned outflows and remaining budgets.
    const committedTotal = committedPlanned + committedBudget;

    // effectiveTotal represents the total liquid assets + inflows.
    // The bar segments should add up to this total.
    const effectiveTotal = Math.max(
        totalLiquidAssets + totalFutureInflow,
        committedTotal + committedLiabilities + safeToSpend
    );
    const reserve = Math.max(0, effectiveTotal - (committedTotal + committedLiabilities + safeToSpend));

    const isOverCommitted = (committedTotal + committedLiabilities) > totalLiquidAssets;
    const isPositiveSafeToSpend = !isOverCommitted && safeToSpend > 0;

    return (
        <>
            <View style={styles.container}>
                <View style={styles.heroWrap}>
                    <View style={styles.kickerRow}>
                        <AppText
                            variant="caption"
                            weight="bold"
                            color={isOverCommitted ? "error" : (isPositiveSafeToSpend ? "success" : "secondary")}
                            style={styles.kickerText}
                        >
                            {isOverCommitted ? AppConfig.strings.dashboard.shortfall : AppConfig.strings.dashboard.safeToSpendTitle}
                        </AppText>
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Open safe-to-spend calculation info"
                            onPress={() => setInfoVisible(true)}
                            style={styles.infoButton}
                        >
                            <AppIcon
                                name="helpCircle"
                                fallbackIcon="helpCircle"
                                size={Size.xs}
                                color={isOverCommitted ? theme.error : theme.textSecondary}
                            />
                        </TouchableOpacity>
                    </View>

                    <AppText
                        variant="hero"
                        color={isOverCommitted ? "error" : (isPositiveSafeToSpend ? "success" : undefined)}
                        style={[styles.amount, { fontFamily: fonts.bold }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.55}
                        ellipsizeMode="tail"
                    >
                        {format(isOverCommitted ? (committedTotal + committedLiabilities - totalLiquidAssets) : safeToSpend)}
                    </AppText>
                    <AppText
                        variant="caption"
                        color={isOverCommitted ? "error" : (isPositiveSafeToSpend ? "success" : "secondary")}
                    >
                        {isOverCommitted ? AppConfig.strings.dashboard.neededForObligations : AppConfig.strings.dashboard.afterObligations}
                    </AppText>
                </View>

                <View style={styles.breakdownContainer}>
                    {effectiveTotal > 0 ? (
                        <>
                            {/* Segmented Bar */}
                            <View style={[styles.progressBarContainer, { backgroundColor: theme.surfaceSecondary }]}>

                                {committedTotal > 0 && (
                                    <View style={[styles.progressSegment, { flex: committedTotal, backgroundColor: theme.warning }]} />
                                )}
                                {committedLiabilities > 0 && (
                                    <View style={[styles.progressSegment, { flex: committedLiabilities, backgroundColor: theme.error }]} />
                                )}
                                {safeToSpend > 0 && (
                                    <View style={[styles.progressSegment, { flex: safeToSpend, backgroundColor: theme.primary }]} />
                                )}
                                {reserve > 0 && (
                                    <View style={[styles.progressSegment, { flex: reserve, backgroundColor: theme.surfaceSecondary }]} />
                                )}
                            </View>

                            {/* Legend */}
                            <View style={styles.legendContainer}>
                                <TouchableOpacity
                                    style={styles.legendItem}
                                    onPress={() => setSelectedLegendItem('safe')}
                                >
                                    <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
                                    <AppText variant="caption" color="secondary">Safe: {format(safeToSpend)}</AppText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.legendItem}
                                    onPress={() => setSelectedLegendItem('committed')}
                                >
                                    <View style={[styles.legendDot, { backgroundColor: theme.warning }]} />
                                    <AppText variant="caption" color="secondary">Committed: {format(committedTotal)}</AppText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.legendItem}
                                    onPress={() => setSelectedLegendItem('debts')}
                                >
                                    <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
                                    <AppText variant="caption" color="secondary">Debts: {format(committedLiabilities)}</AppText>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <View style={styles.emptyState}>
                            <AppText variant="caption" color="secondary">
                                {AppConfig.strings.dashboard.noDataForBreakdown}
                            </AppText>
                        </View>
                    )}
                </View>

                {projection && projection.history.length > 0 && (() => {
                    const chartData = [
                        ...projection.history.map(p => ({ x: p.timestamp, y: p.value })),
                        ...projection.projection.slice(1).map(p => ({ x: p.timestamp, y: p.value }))
                    ];

                    const minX = Math.min(...chartData.map(d => d.x));
                    const maxX = Math.max(...chartData.map(d => d.x));

                    const tickCount = 5;
                    const xTicks = [];
                    for (let i = 0; i < tickCount; i++) {
                        xTicks.push(minX + ((maxX - minX) * i) / (tickCount - 1));
                    }

                    return (
                        <View style={[styles.projectionContainer, { borderColor: theme.border }]}>
                            <AppText variant="body" weight="medium" style={styles.projectionTitle}>
                                Trajectory (60-day projected)
                            </AppText>
                            <LineChart
                                data={chartData}
                                height={150}
                                color={isOverCommitted ? theme.error : theme.primary}
                                xTicks={xTicks}
                                formatXTick={(x) => dayjs(x).format('MMM D')}
                                todayX={dayjs().startOf('day').valueOf()}
                            />
                            {projection.safeDaysCount !== null && (
                                <View style={[styles.safetyMetricContainer, { backgroundColor: theme.surfaceSecondary }]}>
                                    <AppIcon name="checkCircle" fallbackIcon="checkCircle" size={Size.sm} color={theme.success} />
                                    <AppText variant="caption" weight="medium" color="success">
                                        Safe for the next {projection.safeDaysCount > 99 ? '99+' : projection.safeDaysCount} days
                                    </AppText>
                                </View>
                            )}
                            {projection.safeDaysCount === null && (
                                <View style={[styles.safetyMetricContainer, { backgroundColor: theme.surfaceSecondary }]}>
                                    <AppIcon name="checkCircle" fallbackIcon="checkCircle" size={Size.sm} color={theme.success} />
                                    <AppText variant="caption" weight="medium" color="success">
                                        Financially secure
                                    </AppText>
                                </View>
                            )}
                        </View>
                    );
                })()}
            </View>

            <PopupModal
                visible={isInfoVisible}
                title={info.title}
                onClose={() => setInfoVisible(false)}
                maxHeightPercent={84}
                accessibilityCloseLabel="Close safe-to-spend info"
                actions={[
                    {
                        label: info.closeCta,
                        variant: 'primary',
                        onPress: () => setInfoVisible(false),
                    }
                ]}
            >
                <View style={styles.modalSection}>
                    <AppText variant="body">{info.intro}</AppText>
                </View>

                <View style={[styles.modalHighlight, { backgroundColor: theme.surfaceSecondary }]}>
                    <AppText variant="body" weight="medium" color="primary">
                        {info.unlocks}
                    </AppText>
                </View>

                <View style={styles.modalSection}>
                    <AppText variant="heading" style={styles.modalSectionTitle}>{info.formulaTitle}</AppText>
                    {info.formulaItems.map((item, index) => {
                        const [title, content] = item.split(': ');
                        return (
                            <View key={index} style={styles.bulletRow}>
                                <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
                                <View style={styles.bulletContent}>
                                    <AppText variant="caption" weight="bold">{title}:</AppText>
                                    <AppText variant="caption" color="secondary">{content}</AppText>
                                </View>
                            </View>
                        );
                    })}
                </View>

                <View style={styles.modalSection}>
                    <AppText variant="heading" style={styles.modalSectionTitle}>{info.bucketTitle}</AppText>
                    {renderSubtypeGroup('Assets bucket', info.formulaItems[0], liquidAssetSubtypes, liquidAssetAccountNames)}
                    {renderSubtypeGroup('Debts bucket', info.formulaItems[1], liquidLiabilitySubtypes, liquidLiabilityAccountNames)}
                    {renderSubtypeGroup('Budgets bucket', info.formulaItems[2], budgetSubtypes, budgetAccountNames)}
                </View>

                <View style={styles.modalSection}>
                    <AppText variant="heading" style={styles.modalSectionTitle}>{info.exampleTitle}</AppText>
                    <View style={[styles.exampleBox, { borderColor: theme.border }]}>
                        <AppText variant="caption" color="secondary">Projected Liquidity (Assets + Inflow): {format(totalLiquidAssets + totalFutureInflow)}</AppText>
                        <AppText variant="caption" color="secondary">Committed (Budgets + Planned): -{format(committedTotal)}</AppText>
                        <AppText variant="caption" color="secondary">Debts (Liability payments due): -{format(committedLiabilities)}</AppText>
                        <View style={[styles.snapshotDivider, { backgroundColor: theme.border }]} />
                        <AppText variant="body" weight="bold">Safe to Spend: {format(safeToSpend)}</AppText>
                    </View>
                </View>

                <View style={styles.modalSection}>
                    <AppText variant="heading" style={styles.modalSectionTitle}>{info.benefitsTitle}</AppText>
                    {info.benefits.map((item, index) => {
                        const [title, content] = item.split(': ');
                        return (
                            <View key={index} style={styles.benefitRow}>
                                <AppText variant="body" weight="bold">{title}:</AppText>
                                <AppText variant="body" color="secondary">{content}</AppText>
                            </View>
                        );
                    })}
                </View>

                <View style={styles.modalFooter}>
                    <AppText variant="caption" italic color="secondary">
                        {info.footer}
                    </AppText>
                </View>
            </PopupModal>

            <PopupModal
                visible={selectedLegendItem !== null}
                title={
                    selectedLegendItem === 'safe' ? AppConfig.strings.dashboard.legendDetails.safeTitle :
                        selectedLegendItem === 'committed' ? AppConfig.strings.dashboard.legendDetails.committedTitle :
                            AppConfig.strings.dashboard.legendDetails.debtsTitle
                }
                onClose={() => setSelectedLegendItem(null)}
                actions={[
                    {
                        label: 'Got it',
                        onPress: () => setSelectedLegendItem(null),
                    }
                ]}
            >
                {selectedLegendItem === 'safe' && (
                    <View style={styles.modalSection}>
                        <AppText variant="body">
                            {AppConfig.strings.dashboard.legendDetails.safeDesc}
                        </AppText>
                        <View style={[styles.exampleBox, { backgroundColor: theme.surfaceSecondary }]}>
                            <AppText variant="body" weight="bold">Calculation:</AppText>
                            <AppText variant="caption">Assets - Committed - Debt Dues</AppText>
                            <AppText variant="caption">{format(totalLiquidAssets)} - {format(committedTotal)} - {format(committedLiabilities)}</AppText>
                            <View style={[styles.snapshotDivider, { backgroundColor: theme.border }]} />
                            <AppText variant="body" weight="bold" color="primary">Total: {format(safeToSpend)}</AppText>
                        </View>
                    </View>
                )}

                {selectedLegendItem === 'committed' && (
                    <View style={styles.modalSection}>
                        <AppText variant="body">
                            {AppConfig.strings.dashboard.legendDetails.committedDesc}
                        </AppText>
                        <View style={styles.breakdownList}>
                            <View style={styles.breakdownRow}>
                                <AppText variant="caption">Planned Payments</AppText>
                                <AppText variant="caption" weight="bold">{format(committedPlannedPayments)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="caption">Planned Journals/Transfers</AppText>
                                <AppText variant="caption" weight="bold">{format(committedPlannedJournals)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="caption">Active Budgets (Remaining)</AppText>
                                <AppText variant="caption" weight="bold">{format(committedBudget)}</AppText>
                            </View>
                            <View style={[styles.snapshotDivider, { backgroundColor: theme.border }]} />
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="bold">Total Committed</AppText>
                                <AppText variant="body" weight="bold" color="warning">{format(committedTotal)}</AppText>
                            </View>
                        </View>
                    </View>
                )}

                {selectedLegendItem === 'debts' && (
                    <View style={styles.modalSection}>
                        <AppText variant="body">
                            {AppConfig.strings.dashboard.legendDetails.debtsDesc}
                        </AppText>
                        <View style={styles.breakdownList}>
                            <View style={styles.breakdownRow}>
                                <AppText variant="caption">Credit Card Statements</AppText>
                                <AppText variant="caption" weight="bold">{format(totalLiabilitiesCC)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="caption">Other Liquid Liabilities</AppText>
                                <AppText variant="caption" weight="bold">{format(totalLiabilitiesOther)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="bold">Total Due (30d)</AppText>
                                <AppText variant="body" weight="bold" color="error">{format(committedLiabilities)}</AppText>
                            </View>
                            <View style={[styles.snapshotDivider, { backgroundColor: theme.border }]} />
                            <View style={styles.breakdownRow}>
                                <AppText variant="caption">Total Balance (Informational)</AppText>
                                <AppText variant="caption">{format(totalLiabilities)}</AppText>
                            </View>
                        </View>
                    </View>
                )}
            </PopupModal>
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.lg,
    },
    kickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    kickerBadge: {
        width: Size.md,
        height: Size.md,
        borderRadius: Spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    kickerText: {
        letterSpacing: Typography.letterSpacing.wide,
    },
    infoButton: {
        marginLeft: 'auto',
        width: Size.md,
        height: Size.md,
        borderRadius: Spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroWrap: {
        marginBottom: Spacing.xl,
    },
    amount: {
        marginBottom: Spacing.xs,
        width: '100%',
        flexShrink: 1,
    },
    breakdownContainer: {
        marginTop: Spacing.sm,
        marginBottom: Spacing.md,
    },
    progressBarContainer: {
        height: 12,
        flexDirection: 'row',
        borderRadius: Shape.radius.full,
        overflow: 'hidden',
        marginBottom: Spacing.md,
        width: '100%',
    },
    progressSegment: {
        height: '100%',
    },
    legendContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: Spacing.sm,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    emptyState: {
        paddingVertical: Spacing.sm,
        alignItems: 'center',
    },
    projectionContainer: {
        marginTop: Spacing.sm,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
    },
    projectionTitle: {
        marginBottom: Spacing.md,
    },
    safetyMetricContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: Spacing.md,
        padding: Spacing.sm,
        borderRadius: Shape.radius.md,
    },
    modalHighlight: {
        padding: Spacing.md,
        borderRadius: Shape.radius.md,
    },
    modalSection: {
        gap: Spacing.xs,
    },
    modalSectionTitle: {
        fontSize: Typography.sizes.base,
    },
    modalSectionHint: {
        opacity: Opacity.heavy,
    },
    modalSectionValue: {
        marginTop: Spacing.xs,
    },
    modalMetaGroup: {
        marginTop: Spacing.xs,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    bulletContent: {
        flex: 1,
        gap: Spacing.xs,
    },
    exampleBox: {
        borderWidth: 1,
        borderRadius: Shape.radius.md,
        padding: Spacing.md,
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    snapshotDivider: {
        height: 1,
        width: '100%',
        marginVertical: Spacing.xs,
    },
    benefitRow: {
        marginTop: Spacing.xs,
    },
    breakdownList: {
        marginTop: Spacing.sm,
        gap: Spacing.xs,
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    modalFooter: {
        marginTop: Spacing.sm,
        paddingTop: Spacing.md,
    },
});
