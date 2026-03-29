import { InfoSheet } from '@/src/components/common/InfoSheet';
import { AppCard, AppText } from '@/src/components/core';
import { AppConfig, Spacing, Typography, withOpacity } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SafeToSpendLegendModalProps {
    visible: boolean;
    onClose: () => void;
    type: 'safe' | 'committed' | 'debts' | null;
    labels: any;
    formatValue: (val: number) => string | React.ReactNode;
    totalLiquidAssets: number;
    totalFutureInflow: number;
    committedBudget: number;
    committedPlanned: number;
    committedLiabilities: number;
    safeToSpend: number;
    incomeBreakdown: any[];
    committedBreakdown: any[];
    debtBreakdown: any[];
    firstMajorInflowDay: number | null;
    totalLiabilities: number;
    committedLiabilitiesCC: number;
    committedLiabilitiesOther: number;
    committedTotal: number;
}

export const SafeToSpendLegendModal = (props: SafeToSpendLegendModalProps) => {
    const {
        visible, onClose, type, labels, formatValue,
        totalLiquidAssets, totalFutureInflow, committedBudget,
        committedPlanned, committedLiabilities, safeToSpend,
        incomeBreakdown, committedBreakdown, debtBreakdown,
        firstMajorInflowDay, totalLiabilities,
        committedLiabilitiesCC, committedLiabilitiesOther,
        committedTotal
    } = props;

    const { theme } = useTheme();
    const strings = AppConfig.strings.dashboard;
    const legendStrings = strings.legendDetails;

    if (!type) return null;

    const title = type === 'safe' ? legendStrings.safeTitle :
        type === 'committed' ? legendStrings.committedTitle :
            legendStrings.debtsTitle;

    return (
        <InfoSheet
            visible={visible}
            title={title}
            onClose={onClose}
            primaryAction={{
                label: strings.safeToSpendExplanation.closeCta,
                onPress: onClose,
            }}
        >
            {type === 'safe' && (
                <View style={styles.modalSection}>
                    <AppText variant="body" style={{ marginBottom: Spacing.md, lineHeight: 22 }}>
                        {legendStrings.safeDesc}
                    </AppText>
                    <AppCard
                        elevation="none"
                        style={{
                            backgroundColor: withOpacity(theme.surfaceSecondary, 0.3),
                            borderColor: theme.primary,
                            borderWidth: 1,
                            borderStyle: 'dashed'
                        }}
                    >
                        <AppText variant="heading" style={{ color: theme.primary, marginBottom: Spacing.sm, fontSize: Typography.sizes.lg + 2 }}>{labels.calculationTitle}</AppText>
                        <AppText variant="caption" color="secondary" weight="bold" style={{ marginBottom: Spacing.md, letterSpacing: 1 }}>{labels.calculationFormula.toUpperCase()}</AppText>

                        <View style={{ gap: Spacing.md }}>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" color="secondary">Liquid Assets</AppText>
                                <AppText variant="body" weight="bold" color="success">+{formatValue(totalLiquidAssets)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" color="secondary">Upcoming Income</AppText>
                                <AppText variant="body" weight="bold" color="success">+{formatValue(totalFutureInflow)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" color="secondary">Committed Items</AppText>
                                <AppText variant="body" weight="bold" color="warning">-{formatValue(committedBudget + committedPlanned)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" color="secondary">Unsettled Debts</AppText>
                                <AppText variant="body" weight="bold" color="error">-{formatValue(committedLiabilities)}</AppText>
                            </View>
                            <Separator marginVertical="md" opacity={0.3} />
                            <View style={styles.breakdownRow}>
                                <AppText variant="heading" style={{ fontSize: Typography.sizes.xl }}>Safe to Spend</AppText>
                                <AppText variant="heading" style={{ color: theme.primary, fontSize: Typography.sizes.xl }}>{formatValue(safeToSpend)}</AppText>
                            </View>
                        </View>

                        <View style={{ marginTop: Spacing.lg, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: withOpacity(theme.border, 0.2), borderStyle: 'dashed' }}>
                            <AppText variant="caption" italic color="secondary" style={{ lineHeight: 18 }}>
                                Logic: Future income is used to &quot;buffer&quot; your bills. Today&apos;s cash is only reserved if future income won&apos;t cover an obligation before its due date.
                            </AppText>
                        </View>
                    </AppCard>

                    {incomeBreakdown.length > 0 && (
                        <View style={{ marginTop: Spacing.xl }}>
                            <AppText variant="caption" weight="bold" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.md }}>
                                {labels.upcomingIncome.toUpperCase()}
                            </AppText>
                            <View style={{ gap: Spacing.md }}>
                                {incomeBreakdown.filter(inc => inc.amount !== 0).map((inc, i) => (
                                    <View key={i} style={styles.breakdownRow}>
                                        <View style={{ flex: 1 }}>
                                            <AppText variant="caption" weight="bold">{inc.name}</AppText>
                                            <AppText variant="caption" color="secondary" style={{ fontSize: 9 }}>Day {inc.dayOffset} • {inc.type === 'PLANNED_PAYMENT' ? 'Bill' : 'Transfer'}</AppText>
                                        </View>
                                        <AppText variant="caption" weight="bold" color="success">+{formatValue(inc.amount)}</AppText>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            )}

            {type === 'committed' && (
                <View style={styles.modalSection}>
                    <AppText variant="body" style={{ marginBottom: Spacing.md }}>
                        {legendStrings.committedDesc}
                    </AppText>

                    <View style={{ gap: Spacing.md }}>
                        {(() => {
                            const flatCommitted = committedBreakdown.flatMap(acc =>
                                acc.details
                                    .filter((d: any) => d.amount !== 0)
                                    .map((d: any) => ({
                                        ...d,
                                        accountName: acc.accountName
                                    }))
                            );

                            const beforeIncome = flatCommitted.filter(d => (d.dayOffset ?? 0) <= (firstMajorInflowDay || 0));
                            const afterIncome = flatCommitted.filter(d => (d.dayOffset ?? 0) > (firstMajorInflowDay || 0));

                            const renderGroup = (items: typeof flatCommitted, title: string) => {
                                if (items.length === 0) return null;
                                const total = items.reduce((sum, item) => sum + item.amount, 0);

                                return (
                                    <View key={title} style={{ marginBottom: Spacing.xl }}>
                                        <View style={[styles.breakdownRow, { marginBottom: Spacing.sm }]}>
                                            <AppText variant="caption" weight="bold" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                                {title}
                                            </AppText>
                                            <AppText variant="caption" weight="bold" color="warning">{formatValue(total)}</AppText>
                                        </View>
                                        <View style={{ gap: Spacing.md }}>
                                            {items.map((item) => (
                                                <View key={item.id} style={styles.breakdownRow}>
                                                    <View style={{ flex: 1 }}>
                                                        <AppText variant="body" weight="bold">{item.name}</AppText>
                                                        <AppText variant="caption" color="secondary">
                                                            {item.type === 'BUDGET' ? 'Budget Reserve' : item.type === 'PLANNED_PAYMENT' ? 'Planned Payment' : 'Planned Transfer'} • {item.accountName}
                                                        </AppText>
                                                    </View>
                                                    <AppText variant="body" weight="bold" color="warning">
                                                        {formatValue(item.amount)}
                                                    </AppText>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                );
                            };

                            return (
                                <>
                                    {renderGroup(beforeIncome, "Due Before Major Income")}
                                    {firstMajorInflowDay !== null && renderGroup(afterIncome, "Due After Major Income")}
                                </>
                            );
                        })()}

                        <Separator marginVertical="xs" opacity={0.3} />
                        <View style={styles.breakdownRow}>
                            <AppText variant="body" weight="bold" style={{ fontSize: Typography.sizes.lg }}>{labels.totalCommitted}</AppText>
                            <AppText variant="body" weight="bold" color="warning" style={{ fontSize: Typography.sizes.lg }}>{formatValue(committedTotal)}</AppText>
                        </View>
                    </View>
                </View>
            )}

            {type === 'debts' && (
                <View style={styles.modalSection}>
                    <AppText variant="body" style={{ marginBottom: Spacing.md }}>
                        {legendStrings.debtsDesc}
                    </AppText>

                    <View style={{ gap: Spacing.md }}>
                        <View style={styles.breakdownRow}>
                            <AppText variant="body" weight="medium">{labels.creditCardStatements}</AppText>
                            <AppText variant="body" weight="bold">{formatValue(committedLiabilitiesCC)}</AppText>
                        </View>
                        <View style={styles.breakdownRow}>
                            <AppText variant="body" weight="medium">{labels.otherLiquidLiabilities}</AppText>
                            <AppText variant="body" weight="bold">{formatValue(committedLiabilitiesOther)}</AppText>
                        </View>

                        <Separator marginVertical="xl" opacity={0.3} />

                        {(() => {
                            const beforeIncome = debtBreakdown.filter(d => d.amount !== 0 && d.dayOffset <= (firstMajorInflowDay || 0));
                            const afterIncome = debtBreakdown.filter(d => d.amount !== 0 && d.dayOffset > (firstMajorInflowDay || 0));

                            const renderGroup = (items: typeof debtBreakdown, title: string) => {
                                if (items.length === 0) return null;
                                const total = items.reduce((sum, item) => sum + item.amount, 0);

                                return (
                                    <View key={title} style={{ marginBottom: Spacing.xl }}>
                                        <View style={[styles.breakdownRow, { marginBottom: Spacing.sm }]}>
                                            <AppText variant="caption" weight="bold" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                                {title}
                                            </AppText>
                                            <AppText variant="caption" weight="bold" color="error">{formatValue(total)}</AppText>
                                        </View>
                                        <View style={{ gap: Spacing.md }}>
                                            {items.map((item) => (
                                                <View key={item.accountId} style={styles.breakdownRow}>
                                                    <View style={{ flex: 1 }}>
                                                        <AppText variant="body" weight="bold">{item.accountName}</AppText>
                                                        <AppText variant="caption" color="secondary">
                                                            {item.type === 'FALLBACK' ? labels.unplannedBalance : labels.scheduledCommitment} • Day {item.dayOffset}
                                                        </AppText>
                                                    </View>
                                                    <AppText variant="body" weight="bold" color="error">
                                                        {formatValue(item.amount)}
                                                    </AppText>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                );
                            };

                            return (
                                <>
                                    {renderGroup(beforeIncome, "Due Before Major Income")}
                                    {firstMajorInflowDay !== null && renderGroup(afterIncome, "Due After Major Income")}
                                </>
                            );
                        })()}

                        <Separator marginVertical="xs" opacity={0.3} />

                        <View style={styles.breakdownRow}>
                            <AppText variant="body" weight="bold" style={{ fontSize: Typography.sizes.lg }}>{labels.debtsBucket}</AppText>
                            <AppText variant="body" weight="bold" color="error" style={{ fontSize: Typography.sizes.lg }}>{formatValue(committedLiabilities)}</AppText>
                        </View>
                        <Separator marginVertical="md" opacity={0.3} />
                        <View style={styles.breakdownRow}>
                            <AppText variant="caption" color="secondary" weight="bold">{labels.totalBalanceInfo.toUpperCase()}</AppText>
                            <AppText variant="body" color="secondary" weight="bold">{formatValue(totalLiabilities)}</AppText>
                        </View>
                    </View>
                </View>
            )}
        </InfoSheet>
    );
};

const styles = StyleSheet.create({
    modalSection: {
        gap: Spacing.xs,
        marginBottom: Spacing.md,
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
});
