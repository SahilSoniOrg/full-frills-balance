import { LineChart } from '@/src/components/charts/LineChart';
import { PopupModal } from '@/src/components/common/PopupModal';
import { AppCard, AppText, AppIcon, Badge } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing, Typography, withOpacity, Opacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { AccountSubtype, formatAccountSubtypeLabel } from '@/src/data/models/Account';
import { Bleed, Box, FadeIn, Inline, Separator, Skeleton, Stack, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { SafeToSpendProjection } from '@/src/services/notification/NotificationService';
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
    committedLiabilitiesCC: number;
    committedLiabilitiesOther: number;
    committedPlannedPayments: number;
    committedPlannedJournals: number;
    totalFutureInflow: number;
    totalLiquidAssets: number;
    totalLiabilities: number;
    totalLiabilitiesCC: number;
    totalLiabilitiesOther: number;
    shortfall: number;
    currencyCode: string;
    liquidAssetSubtypes: AccountSubtype[];
    liquidAssetAccounts: { name: string, amount: number }[];
    dailyBudgetBurn: number;
    currentMonthBudgetRemaining: number;
    nextMonthBudgetProjected: number;
    nextMonthProjectionDays: number;
    committedBreakdown: {
        accountId: string,
        accountName: string,
        amount: number,
        details: { id: string, name: string, amount: number, type: 'BUDGET' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL', dayOffset?: number }[]
    }[];
    incomeBreakdown: {
        id: string,
        name: string,
        amount: number,
        dayOffset: number,
        type: 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL'
    }[];
    firstMajorInflowDay: number | null;
    debtBreakdown: {
        accountId: string,
        accountName: string,
        amount: number,
        type: 'FALLBACK' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL'
    }[];
    isLoading?: boolean;
}

export const SafeToSpendCard = ({
    safeToSpend,
    shortfall,
    projection,
    committedBudget,
    committedPlanned,
    committedLiabilities,
    committedLiabilitiesCC,
    committedLiabilitiesOther,
    committedPlannedPayments,
    committedPlannedJournals,
    totalFutureInflow,
    totalLiquidAssets,
    totalLiabilities,
    currencyCode,
    liquidAssetSubtypes,
    liquidAssetAccounts,
    currentMonthBudgetRemaining,
    nextMonthBudgetProjected,
    nextMonthProjectionDays,
    committedBreakdown,
    debtBreakdown,
    incomeBreakdown,
    firstMajorInflowDay,
    isLoading = false
}: SafeToSpendCardProps) => {
    const { theme } = useTheme();
    const { isPrivacyMode } = useUI();
    const [isInfoVisible, setInfoVisible] = React.useState(false);
    const [expandedSection, setExpandedSection] = React.useState<'assets' | 'income' | 'committed' | 'debts' | null>(null);
    const [selectedLegendItem, setSelectedLegendItem] = React.useState<'safe' | 'committed' | 'debts' | null>(null);
    const info = AppConfig.strings.dashboard.safeToSpendExplanation;
    const labels = AppConfig.strings.dashboard.safeToSpendUi;
    const formulaItems = [
        'Liquid Balance: Current cash available in your liquid accounts.',
        'Future Income: Predicted inflows (paychecks, transfers) in next 30 days.',
        'Committed: Reserved for bills, debt payments, and active budgets.',
        'Unsettled Debts: Obligations not yet covered by a plan.',
        'Safe to Spend is the lowest point your balance hits in the next 30 days.'
    ];
    const projectionWindowDays = AppConfig.defaults.safeToSpendDays * 2;

    const format = (val: number) => {
        if (isLoading) return <Skeleton width={60} height={24} />;
        if (isPrivacyMode) return '••••';
        return CurrencyFormatter.format(val, currencyCode, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    };

    const renderSubtypeGroup = (
        title: string,
        subtitle: string,
        subtypes: AccountSubtype[],
        accounts: { name: string, amount?: number }[] | string[]
    ) => (
        <Stack gap="md">
            {!!title && (
                <Text
                    variant="heading"
                    style={{ fontSize: Typography.sizes.lg + 2 }}
                    marginBottom="xs"
                >
                    {title}
                </Text>
            )}
            {!!subtitle && (
                <Text variant="base" color="secondary" marginBottom="sm" style={{ opacity: 0.9 }}>
                    {subtitle}
                </Text>
            )}

            <Stack gap="sm">
                <Text variant="xs" weight="bold" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10 }}>
                    {labels.categoriesUsed}
                </Text>
                <Inline gap="xs">
                    {subtypes.length > 0 ? (
                        subtypes.map((st, i) => (
                            <Badge key={i} size="sm" variant="secondary" style={{ backgroundColor: withOpacity(theme.surfaceSecondary, 0.8) }}>
                                {formatAccountSubtypeLabel(st)}
                            </Badge>
                        ))
                    ) : (
                        <Text variant="xs" color="secondary" italic>{labels.noneDetectedYet}</Text>
                    )}
                </Inline>
            </Stack>

            <View style={{ gap: Spacing.sm, marginTop: Spacing.xs }}>
                <AppText variant="caption" weight="bold" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 10 }}>
                    {labels.accountsUsed}
                </AppText>
                <View style={{ gap: Spacing.xs }}>
                    {(() => {
                        const positiveAccounts: any[] = [];
                        const zeroAccounts: any[] = [];

                        accounts.forEach(acc => {
                            const isObject = typeof acc !== 'string';
                            const amount = isObject ? acc.amount : undefined;
                            if (amount === 0) {
                                zeroAccounts.push(acc);
                            } else {
                                positiveAccounts.push(acc);
                            }
                        });

                        const renderAccount = (acc: any, index: number, isZero: boolean) => {
                            const isObject = typeof acc !== 'string';
                            const name = isObject ? acc.name : acc;
                            const amount = isObject ? acc.amount : undefined;

                            return (
                                <View key={index} style={[styles.breakdownRow, {
                                    backgroundColor: withOpacity(theme.surfaceSecondary, isZero ? 0.2 : 0.4),
                                    paddingHorizontal: Spacing.sm,
                                    paddingVertical: Spacing.xs,
                                    borderRadius: Shape.radius.sm,
                                    opacity: isZero ? 0.5 : 1
                                }]}>
                                    <AppText variant="caption" weight={isZero ? "regular" : "medium"} style={{ flex: 1 }}>{name}</AppText>
                                    {amount !== undefined && (
                                        <AppText variant="caption" weight="bold" color="secondary">{format(amount)}</AppText>
                                    )}
                                </View>
                            );
                        };

                        if (accounts.length === 0) {
                            return <AppText variant="caption" color="secondary" italic>{labels.noneDetectedYet}</AppText>;
                        }

                        return (
                            <>
                                {positiveAccounts.map((acc, i) => renderAccount(acc, i, false))}
                                {zeroAccounts.length > 0 && (
                                    <View style={{ marginTop: Spacing.xs, gap: Spacing.xs }}>
                                        {positiveAccounts.length > 0 && (
                                            <AppText variant="caption" color="secondary" style={{ fontSize: 9, opacity: 0.6, marginLeft: Spacing.xs }}>EMPTY ACCOUNTS</AppText>
                                        )}
                                        {zeroAccounts.map((acc, i) => renderAccount(acc, positiveAccounts.length + i, true))}
                                    </View>
                                )}
                            </>
                        );
                    })()}
                </View>
            </View>
        </Stack>
    );

    // committedTotal represents planned outflows and remaining budgets.
    const committedTotal = committedPlanned + committedBudget;

    // The bar should match the actual safe-to-spend formula:
    // liquid assets minus committed funds minus liabilities due in the window.
    const effectiveTotal = Math.max(
        totalLiquidAssets,
        committedTotal + committedLiabilities + safeToSpend
    );
    // Reserve is removed to prevent the "black sliver". The bar is now always "full" relative to current/required liquidity.

    const isOverCommitted = shortfall > 0;
    const isPositiveSafeToSpend = safeToSpend > 0;

    return (
        <FadeIn>
            <Stack gap="xl">
                <Stack gap="sm">
                    <Inline gap="xs" alignItems="center" justifyContent="space-between">
                        <Text
                            variant="xs"
                            weight="bold"
                            color={isOverCommitted ? "error" : (isPositiveSafeToSpend ? "success" : "secondary")}
                            style={{ letterSpacing: 1.5, textTransform: 'uppercase' }}
                        >
                            {isOverCommitted ? AppConfig.strings.dashboard.shortfall : AppConfig.strings.dashboard.safeToSpendTitle}
                        </Text>
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Open safe-to-spend calculation info"
                            onPress={() => {
                                setExpandedSection(null);
                                setInfoVisible(true);
                            }}
                        >
                            <AppIcon
                                name="helpCircle"
                                fallbackIcon="helpCircle"
                                size={Size.xs}
                                color={isOverCommitted ? theme.error : theme.textSecondary}
                            />
                        </TouchableOpacity>
                    </Inline>

                    <Text
                        variant="hero"
                        color={isOverCommitted ? "error" : (isPositiveSafeToSpend ? "success" : undefined)}
                        weight="bold"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.55}
                        ellipsizeMode="tail"
                        style={{ width: '100%' }}
                    >
                        {format(isOverCommitted ? shortfall : safeToSpend)}
                    </Text>
                    <Text
                        variant="xs"
                        color={isOverCommitted ? "error" : (isPositiveSafeToSpend ? "success" : "secondary")}
                    >
                        {isOverCommitted ? AppConfig.strings.dashboard.neededForObligations : AppConfig.strings.dashboard.afterObligations}
                    </Text>
                </Stack>

                <Stack gap="md">
                    {effectiveTotal > 0 ? (
                        <>
                            {/* Segmented Bar */}
                            <Box 
                                background="surfaceSecondary" 
                                height={12} 
                                borderRadius="full" 
                                flexDirection="row" 
                                overflow="hidden"
                                marginBottom="md"
                            >

                                {committedTotal > 0 && (
                                    <View style={[styles.progressSegment, { flex: committedTotal, backgroundColor: theme.warning }]} />
                                )}
                                {committedLiabilities > 0 && (
                                    <View style={[styles.progressSegment, { flex: committedLiabilities, backgroundColor: theme.error }]} />
                                )}
                                {safeToSpend > 0 && (
                                    <View style={[styles.progressSegment, { flex: safeToSpend, backgroundColor: theme.primary }]} />
                                )}
                            </Box>

                            {/* Legend */}
                            <View style={styles.legendContainer}>
                                <TouchableOpacity
                                    style={styles.legendItem}
                                    onPress={() => setSelectedLegendItem('safe')}
                                >
                                    <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
                                    <AppText variant="caption" color="secondary">{labels.safePrefix} {format(safeToSpend)}</AppText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.legendItem}
                                    onPress={() => setSelectedLegendItem('committed')}
                                >
                                    <View style={[styles.legendDot, { backgroundColor: theme.warning }]} />
                                    <AppText variant="caption" color="secondary">{labels.committedPrefix} {format(committedTotal)}</AppText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.legendItem}
                                    onPress={() => setSelectedLegendItem('debts')}
                                >
                                    <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
                                    <AppText variant="caption" color="secondary">{labels.debtsPrefix} {format(committedLiabilities)}</AppText>
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
                </Stack>

                {projection && projection.history.length > 0 && (() => {
                    const chartData = [
                        ...projection.history.map(p => ({ x: p.timestamp, y: p.value })),
                        ...projection.projection.slice(1).map(p => ({ x: p.timestamp, y: p.value }))
                    ];

                    const minX = Math.min(...chartData.map(d => d.x));
                    const maxX = Math.max(...chartData.map(d => d.x));

                    const tickCount = AppConfig.defaults.chartTickCount;
                    const xTicks = [];
                    for (let i = 0; i < tickCount; i++) {
                        xTicks.push(minX + ((maxX - minX) * i) / (tickCount - 1));
                    }

                    const extraHorizontalLines = [
                        { value: 0, label: '0', color: theme.error, strokeDasharray: "2,2" },
                        {
                            value: safeToSpend,
                            label: `${AppConfig.strings.dashboard.safeToSpendTitle}: ${format(safeToSpend)}`,
                            color: theme.primary,
                            strokeDasharray: "4,4"
                        }
                    ];

                    return (
                        <View style={[styles.projectionContainer, { borderColor: theme.border }]}>
                            <AppText variant="body" weight="medium" style={styles.projectionTitle}>
                                {`Trajectory (${projectionWindowDays}-day projected)`}
                            </AppText>
                            <LineChart
                                data={chartData}
                                height={AppConfig.layout.safeToSpendChartHeight}
                                color={isOverCommitted ? theme.error : theme.primary}
                                xTicks={xTicks}
                                formatXTick={(x) => dayjs(x).format('MMM D')}
                                todayX={dayjs().startOf('day').valueOf()}
                                hideLabels={isPrivacyMode}
                                extraHorizontalLines={extraHorizontalLines}
                            />
                            {projection.safeDaysCount !== null && !isOverCommitted && (
                                <View style={[styles.safetyMetricContainer, { backgroundColor: withOpacity(theme.success, 0.1), borderColor: withOpacity(theme.success, 0.2), borderWidth: 1 }]}>
                                    <AppIcon name="checkCircle" fallbackIcon="checkCircle" size={14} color={theme.success} />
                                    <AppText variant="caption" weight="bold" color="success" style={{ fontSize: 11 }}>
                                        Safe for the next {projection.safeDaysCount > AppConfig.defaults.safeToSpendDaysCap ? `${AppConfig.defaults.safeToSpendDaysCap}+` : projection.safeDaysCount} {projection.safeDaysCount === 1 ? 'day' : 'days'}
                                    </AppText>
                                </View>
                            )}
                            {projection.safeDaysCount === null && !isOverCommitted && (
                                <View style={[styles.safetyMetricContainer, { backgroundColor: withOpacity(theme.success, 0.1), borderColor: withOpacity(theme.success, 0.2), borderWidth: 1 }]}>
                                    <AppIcon name="checkCircle" fallbackIcon="checkCircle" size={14} color={theme.success} />
                                    <AppText variant="caption" weight="bold" color="success" style={{ fontSize: 11 }}>
                                        {labels.financiallySecure}
                                    </AppText>
                                </View>
                            )}
                        </View>
                    );
                })()}
            </Stack>

            <PopupModal
                visible={isInfoVisible}
                title={info.title}
                onClose={() => setInfoVisible(false)}
                accessibilityCloseLabel="Close safe-to-spend info"
                actions={[
                    {
                        label: info.closeCta,
                        variant: 'primary',
                        onPress: () => setInfoVisible(false),
                    }
                ]}
            >
                {/* 1. Hero Summary */}
                <AppText
                    variant="heading"
                    style={{
                        marginBottom: Spacing.sm,
                        fontFamily: Typography.fonts.heading,
                        fontSize: Typography.sizes.xxxl,
                        color: theme.primary,
                    }}
                >
                    Spend with confidence.
                </AppText>
                <AppText
                    variant="body"
                    color="secondary"
                    style={{
                        marginBottom: Spacing.xl,
                        lineHeight: Typography.sizes.base * 1.5,
                        opacity: 0.9
                    }}
                >
                    {info.intro}
                </AppText>

                {/* 2. Vertical Waterfall Ledger */}
                <AppCard
                    padding="none"
                    elevation="lg"
                    style={{
                        marginBottom: Spacing.xl,
                        // backgroundColor: withOpacity(theme.surface, 0.4),
                        borderRadius: Shape.radius.r3,
                        borderWidth: 1,
                        borderColor: withOpacity(theme.border, 0.4),
                        overflow: 'hidden'
                    }}
                >
                    {/* Header */}
                    <Bleed horizontal="lg">
                        <View style={{
                            padding: Spacing.lg,
                            borderBottomWidth: 1,
                            borderBottomColor: withOpacity(theme.border, 0.4),
                            backgroundColor: withOpacity(theme.surfaceSecondary, 0.5),
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: Spacing.sm
                        }}>
                            <AppIcon name="calculator" size={Size.xs} color={theme.textTertiary} />
                            <AppText variant="caption" weight="bold" color="secondary" style={{ letterSpacing: 1.5 }}>CALCULATION LEDGER</AppText>
                        </View>
                    </Bleed>

                    {/* Step 1: Assets */}
                    <TouchableOpacity
                        style={{ flexDirection: 'row' }}
                        onPress={() => setExpandedSection(expandedSection === 'assets' ? null : 'assets')}
                    >
                        <View style={{ width: 4, backgroundColor: theme.primary }} />
                        <View style={{ flex: 1, padding: Spacing.lg }}>
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.primary, 0.1) }]}>
                                        <AppIcon name="wallet" size={Size.sm} color={theme.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="caption" weight="bold" color="primary" style={{ letterSpacing: 0.5, marginBottom: 2 }}>{info.formulaItems[0].split(': ')[0].toUpperCase()}</AppText>
                                        <AppText variant="caption" color="secondary" numberOfLines={1}>{info.formulaItems[0].split(': ')[1]}</AppText>
                                    </View>
                                </View>
                                <AppText variant="heading" color="primary" style={{ fontSize: Typography.sizes.xl }}>+{format(totalLiquidAssets)}</AppText>
                            </View>
                        </View>
                    </TouchableOpacity>
                    {expandedSection === 'assets' && (
                        <View style={styles.expandedContentRow}>
                            {renderSubtypeGroup("", "", liquidAssetSubtypes, liquidAssetAccounts)}
                        </View>
                    )}
                    <Separator />

                    {/* Step 2: Future Income */}
                    <TouchableOpacity
                        style={{ flexDirection: 'row' }}
                        onPress={() => setExpandedSection(expandedSection === 'income' ? null : 'income')}
                    >
                        <View style={{ width: 4, backgroundColor: theme.primary }} />
                        <View style={{ flex: 1, padding: Spacing.lg }}>
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.primary, 0.1) }]}>
                                        <AppIcon name="arrowUpRight" size={Size.sm} color={theme.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="caption" weight="bold" color="primary" style={{ letterSpacing: 0.5, marginBottom: 2 }}>{labels.upcomingIncome.toUpperCase()}</AppText>
                                        <AppText variant="caption" color="secondary" numberOfLines={1}>{formulaItems[1].split(': ')[1]}</AppText>
                                    </View>
                                </View>
                                <AppText variant="heading" color="primary" style={{ fontSize: Typography.sizes.xl }}>+{format(totalFutureInflow)}</AppText>
                            </View>
                        </View>
                    </TouchableOpacity>
                    {expandedSection === 'income' && (
                        <View style={styles.expandedContentRow}>
                            <View style={{ gap: Spacing.sm }}>
                                {incomeBreakdown.length > 0 ? (
                                    incomeBreakdown.map((inc, i) => (
                                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <View style={{ flex: 1 }}>
                                                <AppText variant="caption" weight="bold">{inc.name}</AppText>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                                                    <AppIcon
                                                        name={inc.type === 'PLANNED_PAYMENT' ? 'calendar' : 'refresh'}
                                                        size={10}
                                                        color={withOpacity(theme.success, 0.7)}
                                                    />
                                                    <AppText variant="caption" color="secondary" style={{ fontSize: 9 }}>
                                                        Day {inc.dayOffset} • {inc.type === 'PLANNED_PAYMENT' ? 'Planned Payment' : 'Transfer'}
                                                    </AppText>
                                                </View>
                                            </View>
                                            <AppText variant="caption" weight="bold" color="success">+{format(inc.amount)}</AppText>
                                        </View>
                                    ))
                                ) : (
                                    <AppText variant="caption" color="secondary" italic>No future income tracked</AppText>
                                )}
                            </View>
                        </View>
                    )}

                    <Separator />

                    {/* Step 3: Committed */}
                    <TouchableOpacity
                        style={{ flexDirection: 'row' }}
                        onPress={() => setExpandedSection(expandedSection === 'committed' ? null : 'committed')}
                    >
                        <View style={{ width: 4, backgroundColor: theme.warning }} />
                        <View style={{ flex: 1, padding: Spacing.lg }}>
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.warning, 0.1) }]}>
                                        <AppIcon name="lock" size={Size.sm} color={theme.warning} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="caption" weight="bold" color="warning" style={{ letterSpacing: 0.5, marginBottom: 2 }}>{labels.committedLine.split(' (')[0].toUpperCase()}</AppText>
                                        <AppText variant="caption" color="secondary" numberOfLines={1}>{formulaItems[2] ? formulaItems[2].split(': ')[1] : 'Bills and Budgets'}</AppText>
                                    </View>
                                </View>
                                <AppText variant="heading" color="warning" style={{ fontSize: Typography.sizes.xl }}>–{format(committedBudget + committedPlanned)}</AppText>
                            </View>
                        </View>
                    </TouchableOpacity>
                    {expandedSection === 'committed' && (
                        <View style={styles.expandedContentRow}>
                            <View style={{ gap: Spacing.md }}>
                                {committedBreakdown.sort((a, b) => b.amount - a.amount).map((acc, i) => (
                                    <View key={i} style={{ gap: Spacing.xs }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <AppText variant="caption" weight="bold">{acc.accountName}</AppText>
                                            <AppText variant="caption" weight="bold" color="warning">–{format(acc.amount)}</AppText>
                                        </View>
                                        <View style={{ gap: Spacing.sm, paddingLeft: Spacing.sm }}>
                                            {acc.details.map((det, di) => {
                                                const isPostIncome = firstMajorInflowDay !== null && det.dayOffset !== undefined && det.dayOffset >= firstMajorInflowDay;
                                                return (
                                                    <View key={di} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 18 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1, paddingRight: Spacing.xs }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 }}>
                                                                <AppIcon
                                                                    name={det.type === 'BUDGET' ? 'pieChart' : det.type === 'PLANNED_PAYMENT' ? 'calendar' : 'refresh'}
                                                                    size={10}
                                                                    color={theme.textSecondary}
                                                                />
                                                                <AppText variant="caption" color="secondary" style={{ fontSize: 10, lineHeight: 14 }}>{det.name}</AppText>
                                                                <AppText style={{ fontSize: 8, opacity: 0.5, color: theme.textSecondary }}>
                                                                    {det.type === 'BUDGET' ? 'Budget' : det.type === 'PLANNED_PAYMENT' ? 'Bill' : 'Plan'}
                                                                </AppText>
                                                                {isPostIncome && (
                                                                    <View style={{ backgroundColor: withOpacity(theme.success, 0.1), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: Spacing.xs }}>
                                                                        <AppText style={{ fontSize: 8, color: theme.success, fontWeight: 'bold' }}>WAITING FOR INCOME</AppText>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        </View>
                                                        <AppText variant="caption" color="secondary" style={{ fontSize: 10, lineHeight: 14 }}>{format(det.amount)}</AppText>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    <Separator style={{ marginVertical: 0, opacity: 0.1 }} />

                    {/* Step 4: Debts */}
                    <TouchableOpacity
                        style={{ flexDirection: 'row' }}
                        onPress={() => setExpandedSection(expandedSection === 'debts' ? null : 'debts')}
                    >
                        <View style={{ width: 4, backgroundColor: theme.error }} />
                        <View style={{ flex: 1, padding: Spacing.lg }}>
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.error, 0.1) }]}>
                                        <AppIcon name="alertCircle" size={Size.sm} color={theme.error} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="caption" weight="bold" color="error" style={{ letterSpacing: 0.5, marginBottom: 2 }}>{labels.debtsBucket.toUpperCase()}</AppText>
                                        <AppText variant="caption" color="secondary" numberOfLines={1}>{formulaItems[3] ? formulaItems[3].split(': ')[1] : 'Short-term liabilities'}</AppText>
                                    </View>
                                </View>
                                <AppText variant="heading" color="error" style={{ fontSize: Typography.sizes.xl }}>–{format(committedLiabilities)}</AppText>
                            </View>
                        </View>
                    </TouchableOpacity>
                    {expandedSection === 'debts' && (
                        <View style={styles.expandedContentRow}>
                            <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.md, opacity: 0.8, fontStyle: 'italic' }}>
                                {labels.debtsHint}
                            </AppText>

                            <View style={{ gap: Spacing.md }}>
                                {debtBreakdown.map((acc, i) => (
                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View style={{ flex: 1 }}>
                                            <AppText variant="caption" weight="bold">{acc.accountName}</AppText>
                                            <AppText variant="caption" color="secondary">
                                                {acc.type === 'FALLBACK' ? 'Unplanned Balance' : 'Scheduled Commitment'}
                                            </AppText>
                                        </View>
                                        <AppText variant="caption" weight="bold" color="error">–{format(acc.amount)}</AppText>
                                    </View>
                                ))}
                            </View>

                            {totalLiabilities > committedLiabilities && (
                                <View style={{
                                    marginTop: Spacing.md,
                                    paddingHorizontal: Spacing.md,
                                    paddingVertical: Spacing.sm,
                                    backgroundColor: withOpacity(theme.asset, 0.1),
                                    borderRadius: Shape.radius.sm,
                                    borderLeftWidth: 3,
                                    borderLeftColor: theme.asset
                                }}>
                                    <AppText variant="caption" color="secondary" style={{ lineHeight: 16 }}>
                                        <AppText variant="caption" weight="bold">{format(totalLiabilities - committedLiabilities)} </AppText>
                                        {labels.debtsCallout}
                                    </AppText>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Result Line */}
                    <View style={{ flexDirection: 'row' }}>
                        <View style={{ width: 4, backgroundColor: theme.primary }} />
                        <View style={{
                            flex: 1,
                            padding: Spacing.lg,
                            backgroundColor: withOpacity(theme.primary, 0.08),
                            borderTopWidth: 1,
                            borderTopColor: withOpacity(theme.primary, 0.3),
                            borderStyle: 'solid',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <View style={{ flex: 1 }}>
                                <AppText variant="caption" weight="bold" color="primary" style={{ letterSpacing: 1.5, marginBottom: 4 }}>SAFE TO SPEND</AppText>
                                <AppText variant="caption" color="secondary" style={{ fontStyle: 'italic', opacity: 0.8 }}>Remaining cash buffer</AppText>
                            </View>
                            <AppText
                                variant="hero"
                                color="primary"
                                style={{
                                    fontFamily: Typography.fonts.heading,
                                    fontSize: Typography.sizes.xxxl,
                                    textAlign: 'right'
                                }}
                            >
                                {format(safeToSpend)}
                            </AppText>
                        </View>
                    </View>
                </AppCard>

                {/* 3. Why this matters */}
                <View style={{ paddingHorizontal: Spacing.sm }}>
                    <AppText variant="body" weight="bold" style={{ marginBottom: Spacing.lg, color: theme.primary, letterSpacing: 1 }}>{info.benefitsTitle.toUpperCase()}</AppText>
                    <View style={{ gap: Spacing.lg }}>
                        {info.benefits.map((item, index) => {
                            const [title, content] = item.split(': ');
                            return (
                                <View key={index} style={{ flexDirection: 'row', gap: Spacing.md }}>
                                    <View style={[styles.benefitDot, { backgroundColor: theme.primary, marginTop: 8 }]} />
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="body" weight="bold">{title}</AppText>
                                        <AppText variant="caption" color="secondary" style={{ marginTop: 2, lineHeight: 18 }}>{content}</AppText>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>

                <View style={{ paddingVertical: Spacing.xxxxl, alignItems: 'center' }}>
                    <Separator background="border" space={1} opacity={0.3} style={{ width: 40, marginBottom: Spacing.lg }} />
                    <AppText variant="caption" italic color="secondary" style={{ textAlign: 'center', opacity: 0.8, paddingHorizontal: Spacing.xl, lineHeight: 18 }}>
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
                        label: info.closeCta,
                        onPress: () => setSelectedLegendItem(null),
                    }
                ]}
            >
                {selectedLegendItem === 'safe' && (
                    <View style={styles.modalSection}>
                        <AppText variant="body" style={{ marginBottom: Spacing.md, lineHeight: 22 }}>
                            {AppConfig.strings.dashboard.legendDetails.safeDesc}
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
                                    <AppText variant="body" weight="bold" color="success">+{format(totalLiquidAssets)}</AppText>
                                </View>
                                <View style={styles.breakdownRow}>
                                    <AppText variant="body" color="secondary">Upcoming Income</AppText>
                                    <AppText variant="body" weight="bold" color="success">+{format(totalFutureInflow)}</AppText>
                                </View>
                                <View style={styles.breakdownRow}>
                                    <AppText variant="body" color="secondary">Committed Items</AppText>
                                    <AppText variant="body" weight="bold" color="warning">-{format(committedBudget + committedPlanned)}</AppText>
                                </View>
                                <View style={styles.breakdownRow}>
                                    <AppText variant="body" color="secondary">Unsettled Debts</AppText>
                                    <AppText variant="body" weight="bold" color="error">-{format(committedLiabilities)}</AppText>
                                </View>
                                <View style={{ height: 1, backgroundColor: withOpacity(theme.border, 0.3), marginVertical: Spacing.xs }} />
                                <View style={styles.breakdownRow}>
                                    <AppText variant="heading" style={{ fontSize: Typography.sizes.xl }}>Safe to Spend</AppText>
                                    <AppText variant="heading" style={{ color: theme.primary, fontSize: Typography.sizes.xl }}>{format(safeToSpend)}</AppText>
                                </View>
                            </View>

                            <View style={{ marginTop: Spacing.lg, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: withOpacity(theme.border, 0.2), borderStyle: 'dashed' }}>
                                <AppText variant="caption" italic color="secondary" style={{ lineHeight: 18 }}>
                                    Logic: Future income is used to &quot;buffer&quot; your bills. Today&apos;s cash is only reserved if future income won&apos;t cover an obligation before its due date.
                                </AppText>
                            </View>
                        </AppCard>
                    </View>
                )}

                {selectedLegendItem === 'committed' && (
                    <View style={styles.modalSection}>
                        <AppText variant="body" style={{ marginBottom: Spacing.md }}>
                            {AppConfig.strings.dashboard.legendDetails.committedDesc}
                        </AppText>

                        <View style={{ gap: Spacing.md }}>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="medium">{labels.plannedPayments}</AppText>
                                <AppText variant="body" weight="bold">{format(committedPlannedPayments)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="medium">{labels.plannedJournals}</AppText>
                                <AppText variant="body" weight="bold">{format(committedPlannedJournals)}</AppText>
                            </View>
                            <Separator />
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                                    <AppText variant="body" weight="medium">{labels.activeBudgets}</AppText>
                                    <View style={{ marginTop: 4, gap: 4 }}>
                                        <AppText variant="caption" color="secondary">
                                            {`• This month remaining: ${format(currentMonthBudgetRemaining)}`}
                                        </AppText>
                                        <AppText variant="caption" color="secondary">
                                            {`• Next month ${nextMonthProjectionDays} days projected: ${format(nextMonthBudgetProjected)}`}
                                        </AppText>
                                    </View>
                                </View>
                                <AppText variant="body" weight="bold">{format(committedBudget)}</AppText>
                            </View>

                            {committedBreakdown.length > 0 && (
                                <View style={styles.accountBreakdownContainer}>
                                <Separator marginVertical="md" opacity={0.3} />
                                    <AppText variant="caption" weight="bold" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.md }}>
                                        {labels.breakdownByAccount}
                                    </AppText>
                                    <View style={{ gap: Spacing.md }}>
                                        {committedBreakdown.map((item) => (
                                            <View key={item.accountId}>
                                                <View style={styles.breakdownRow}>
                                                    <AppText variant="body" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                                                        {item.accountName}
                                                    </AppText>
                                                    <AppText variant="body" weight="bold" color="secondary">
                                                        {format(item.amount)}
                                                    </AppText>
                                                </View>
                                                <View style={{ marginTop: Spacing.xs, gap: 4 }}>
                                                    {item.details.map((d) => {
                                                        const isPostIncome = firstMajorInflowDay !== null && d.dayOffset !== undefined && d.dayOffset >= firstMajorInflowDay;
                                                        return <View key={d.id} style={[styles.breakdownRow, { paddingLeft: Spacing.md }]}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 }}>
                                                                <AppIcon
                                                                    name={d.type === 'BUDGET' ? 'pieChart' : d.type === 'PLANNED_PAYMENT' ? 'calendar' : 'refresh'}
                                                                    size={12}
                                                                    color={withOpacity(theme.textSecondary, 0.5)}
                                                                />
                                                                <AppText variant="caption" color="secondary" numberOfLines={1}>

                                                                    {isPostIncome && (
                                                                        <View style={{ backgroundColor: withOpacity(theme.success, 0.1), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: Spacing.xs }}>
                                                                            <AppText style={{ fontSize: 8, color: theme.success, fontWeight: 'bold' }}>WAITING FOR INCOME</AppText>
                                                                        </View>
                                                                    )}
                                                                    {d.name}
                                                                </AppText>
                                                            </View>
                                                            <AppText variant="caption" color="secondary">
                                                                {format(d.amount)}
                                                            </AppText>
                                                        </View>

                                                    })}
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}
                            <Separator />
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="bold" style={{ fontSize: Typography.sizes.lg }}>{labels.totalCommitted}</AppText>
                                <AppText variant="body" weight="bold" color="warning" style={{ fontSize: Typography.sizes.lg }}>{format(committedTotal)}</AppText>
                            </View>
                        </View>
                    </View>
                )}

                {selectedLegendItem === 'debts' && (
                    <View style={styles.modalSection}>
                        <AppText variant="body" style={{ marginBottom: Spacing.md }}>
                            {AppConfig.strings.dashboard.legendDetails.debtsDesc}
                        </AppText>

                        <View style={{ gap: Spacing.md }}>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="medium">{labels.creditCardStatements}</AppText>
                                <AppText variant="body" weight="bold">{format(committedLiabilitiesCC)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="medium">{labels.otherLiquidLiabilities}</AppText>
                                <AppText variant="body" weight="bold">{format(committedLiabilitiesOther)}</AppText>
                            </View>
                            <Separator marginVertical="xs" opacity={0.3} />
                            <View style={styles.breakdownRow}>
                                <AppText variant="caption" color="secondary" weight="bold">{labels.totalBalanceInfo.toUpperCase()}</AppText>
                                <AppText variant="body" color="secondary" weight="bold">{format(totalLiabilities)}</AppText>
                            </View>
                        </View>

                    </View>
                )}
            </PopupModal>
        </FadeIn>
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
        alignSelf: 'flex-start',
        gap: Spacing.xs,
        marginTop: Spacing.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: Shape.radius.full,
    },
    modalHighlight: {
        padding: Spacing.md,
        borderRadius: Shape.radius.md,
    },
    helpHero: {
        padding: Spacing.md,
        borderRadius: Shape.radius.md,
        marginBottom: Spacing.sm,
    },
    modalSection: {
        gap: Spacing.xs,
        marginBottom: Spacing.md,
    },
    modalSectionTitle: {
        fontSize: Typography.sizes.base,
        marginBottom: Spacing.xs,
    },
    modalSectionHint: {
        opacity: Opacity.heavy,
    },
    exampleBox: {
        borderWidth: 1,
        borderRadius: Shape.radius.md,
        padding: Spacing.md,
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    snapshotSeparator: {
        height: 1,
        width: '100%',
        marginVertical: Spacing.xs,
    },
    benefitDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 8,
    },
    visualFormulaContainer: {
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.lg,
        paddingHorizontal: Spacing.lg,
    },
    visualFormula: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
    },
    formulaPill: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: Shape.radius.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    formulaResultPill: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.lg,
        borderRadius: Shape.radius.lg,
        borderWidth: 1.5,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    formulaEqualRow: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
    cardHeader: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
    },
    expandedContentRow: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    snapshotCard: {
        marginBottom: Spacing.lg,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: '#CBD5E1', // Default border color fallback
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    breakdownList: {
        marginTop: Spacing.sm,
        gap: Spacing.xs,
    },
    modalFooter: {
        marginTop: Spacing.sm,
        paddingTop: Spacing.md,
    },
    accountBreakdownContainer: {
        marginTop: Spacing.sm,
    },
    accountBreakdownTitle: {
        marginBottom: Spacing.xs,
        opacity: Opacity.heavy,
    },
    stepIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
