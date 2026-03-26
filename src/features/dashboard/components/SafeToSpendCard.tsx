import { ChartTooltip } from '@/src/components/charts/ChartTooltip';
import { LineChart } from '@/src/components/charts/LineChart';
import { PopupModal } from '@/src/components/common/PopupModal';
import { AppCard, AppIcon, AppText, Badge } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { AccountSubtype, formatAccountSubtypeLabel } from '@/src/data/models/Account';
import { Box, FadeIn, Inline, Separator, Skeleton, Stack, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { SafeToSpendProjection, SafeToSpendDataPoint } from '@/src/services/notification/NotificationService';
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
        type: 'FALLBACK' | 'PLANNED_PAYMENT' | 'PLANNED_JOURNAL',
        dayOffset: number
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
    totalFutureInflow,
    totalLiquidAssets,
    totalLiabilities,
    currencyCode,
    liquidAssetSubtypes,
    liquidAssetAccounts,
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

    const format = (val: number) => {
        if (isLoading) return <Skeleton width={60} height={24} />;
        if (isPrivacyMode) return '••••';

        const isVerySmall = Math.abs(val) > 0 && Math.abs(val) < 0.5;
        if (isVerySmall) {
            const oneFormatted = CurrencyFormatter.format(1, currencyCode, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            });
            return val > 0 ? `< ${oneFormatted}` : `> -${oneFormatted}`;
        }

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
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
                    {subtypes.length > 0 ? (
                        subtypes.map((st, i) => (
                            <Badge key={i} size="sm" variant="secondary" style={{ backgroundColor: withOpacity(theme.surfaceSecondary, 0.8) }}>
                                {formatAccountSubtypeLabel(st)}
                            </Badge>
                        ))
                    ) : (
                        <Text variant="xs" color="secondary" italic>{labels.noneDetectedYet}</Text>
                    )}
                </View>
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

                        if (positiveAccounts.length === 0) {
                            return <AppText variant="caption" color="secondary" italic>{labels.noneDetectedYet}</AppText>;
                        }

                        return (
                            <>
                                {positiveAccounts.map((acc, i) => renderAccount(acc, i, false))}
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
                    type SafeToSpendChartPoint = SafeToSpendDataPoint & { x: number; y: number; isHistory: boolean };
                    const data: SafeToSpendChartPoint[] = [
                        ...projection.history.map(p => ({ ...p, x: p.timestamp, y: p.value, isHistory: true })),
                        ...projection.projection.map(p => ({ ...p, x: p.timestamp, y: p.value, isHistory: false })),
                    ];

                    const minX = Math.min(...data.map(d => d.x));
                    const maxX = Math.max(...data.map(d => d.x));

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
                        <View style={[styles.projectionContainer, { borderColor: theme.border, overflow: 'visible', zIndex: 1 }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
                                <AppText variant="body" weight="medium">
                                    {`Projection (${AppConfig.defaults.safeToSpendDays}-day)`}
                                </AppText>
                                {!isOverCommitted && projection.safeDaysCount !== null && (
                                    <View style={[styles.safetyMetricContainer, { marginTop: 0, paddingVertical: 2, paddingHorizontal: 6, backgroundColor: withOpacity(theme.success, 0.1), borderColor: withOpacity(theme.success, 0.2), borderWidth: 1 }]}>
                                        <AppIcon name="checkCircle" fallbackIcon="checkCircle" size={12} color={theme.success} />
                                        <AppText variant="caption" weight="bold" color="success" style={{ fontSize: 10 }}>
                                            Safe for {projection.safeDaysCount > AppConfig.defaults.safeToSpendDaysCap ? `${AppConfig.defaults.safeToSpendDaysCap}+` : projection.safeDaysCount} {projection.safeDaysCount === 1 ? 'd' : 'd'}
                                        </AppText>
                                    </View>
                                )}
                                {!isOverCommitted && projection.safeDaysCount === null && (
                                    <View style={[styles.safetyMetricContainer, { marginTop: 0, paddingVertical: 2, paddingHorizontal: 6, backgroundColor: withOpacity(theme.success, 0.1), borderColor: withOpacity(theme.success, 0.2), borderWidth: 1 }]}>
                                        <AppIcon name="checkCircle" fallbackIcon="checkCircle" size={12} color={theme.success} />
                                        <AppText variant="caption" weight="bold" color="success" style={{ fontSize: 10 }}>
                                            {labels.financiallySecure}
                                        </AppText>
                                    </View>
                                )}
                            </View>
                            <View style={{ overflow: 'visible' }}>
                                <LineChart
                                    data={data}
                                    height={AppConfig.layout.safeToSpendChartHeight}
                                    color={isOverCommitted ? theme.error : theme.primary}
                                    xTicks={xTicks}
                                    formatXTick={(x) => dayjs(x).format('MMM D')}
                                    todayX={dayjs().startOf('day').valueOf()}
                                    hideLabels={isPrivacyMode}
                                    extraHorizontalLines={extraHorizontalLines}
                                    avoidPointVertical={true}
                                    renderTooltipContent={(point) => (
                                        <ChartTooltip style={{ minWidth: 100 }}>
                                            <Stack gap="xs">
                                                <Inline justifyContent="space-between" alignItems="center">
                                                    <AppText variant="caption" color="secondary" style={{ fontSize: 10 }}>
                                                        {dayjs(point.x).format('MMM D, YYYY')}
                                                    </AppText>
                                                    {!point.isHistory && (
                                                        <AppIcon
                                                            name="trendingUpDown"
                                                            size={12}
                                                            color={theme.primary}
                                                            style={{ opacity: 0.8 }}
                                                        />
                                                    )}
                                                </Inline>

                                                <AppText variant="body" weight="bold" color={point.y < 0 ? 'error' : 'primary'}>
                                                    {format(point.y)}
                                                </AppText>

                                                {((point as any).dailyBurn > 0 || ((point as any).details?.length || 0) > 0) && (
                                                    <>
                                                        <Separator opacity={0.1} marginVertical="xs" />

                                                        {(point.dailyBurn ?? 0) > 0 && (
                                                            <View style={{ 
                                                                backgroundColor: withOpacity(theme.error, 0.08), 
                                                                paddingHorizontal: 6, 
                                                                paddingVertical: 4, 
                                                                borderRadius: 4, 
                                                                marginBottom: 2 
                                                            }}>
                                                                <Inline gap="xs" alignItems="center">
                                                                    <AppIcon name="flame" size={10} color={theme.error} />
                                                                    <AppText variant="caption" weight="bold" color="error" style={{ fontSize: 10 }}>
                                                                        Daily Burn: {format(point.dailyBurn!)}
                                                                    </AppText>
                                                                </Inline>
                                                            </View>
                                                        )}

                                                        {point.details?.slice(0, AppConfig.defaults.maxTooltipDetails).map((detail, idx) => {
                                                            const isTotalInflow = detail.type === 'INFLOW';
                                                            const isTotalOutflow = detail.type === 'OUTFLOW';
                                                            const isCcDate = detail.type === 'CC_DATE';

                                                            let iconName: any = 'receipt';
                                                            let color = theme.textSecondary;
                                                            if (isTotalInflow) { iconName = 'trending-up'; color = theme.success; }
                                                            else if (isTotalOutflow) { iconName = 'trending-down'; color = theme.error; }
                                                            else if (isCcDate) { iconName = 'calendar'; color = theme.warning; }

                                                            return (
                                                                <Inline key={idx} space="md" justifyContent="space-between" alignItems="center">
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                        <AppIcon name={iconName} size={10} color={color} />
                                                                        <AppText variant="caption" color="secondary" numberOfLines={1} style={{ fontSize: 10, opacity: 0.9 }}>
                                                                            {detail.name}
                                                                        </AppText>
                                                                    </View>
                                                                    {detail.amount !== 0 && (
                                                                        <AppText variant="caption" weight="bold" color={isTotalInflow ? 'success' : (isTotalOutflow ? 'error' : 'primary')} style={{ fontSize: 10 }}>
                                                                            {isTotalOutflow ? '-' : (isTotalInflow ? '+' : '')}{format(detail.amount)}
                                                                        </AppText>
                                                                    )}
                                                                </Inline>
                                                            );
                                                        })}
                                                        {(point.details?.length || 0) > AppConfig.defaults.maxTooltipDetails && (
                                                            <AppText variant="caption" color="secondary" style={{ fontSize: 9, marginLeft: 14 }}>
                                                                + {point.details!.length - AppConfig.defaults.maxTooltipDetails} more
                                                            </AppText>
                                                        )}
                                                    </>
                                                )}
                                            </Stack>
                                        </ChartTooltip>
                                    )}
                                />
                            </View>
                        </View>
                    );
                })()}
                <Separator marginVertical="md" />
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
                        marginTop: Spacing.md,
                        marginBottom: Spacing.sm,
                        fontFamily: Typography.fonts.heading,
                        fontSize: Typography.sizes.xxxl,
                        lineHeight: Typography.sizes.xxxl * 1.1,
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
                    <View style={{
                        padding: Spacing.xl,
                        borderBottomWidth: 1,
                        borderBottomColor: withOpacity(theme.border, 0.4),
                        backgroundColor: withOpacity(theme.surfaceSecondary, 0.5),
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: Spacing.sm
                    }}>
                        <AppIcon name="calculator" size={Size.xs} color={theme.textTertiary} />
                        <AppText variant="caption" weight="bold" color="secondary" style={{ letterSpacing: 1.5 }}>{labels.calculationLedger}</AppText>
                    </View>

                    {/* Step 1: Assets */}
                    <TouchableOpacity
                        style={{ flexDirection: 'row' }}
                        onPress={() => setExpandedSection(expandedSection === 'assets' ? null : 'assets')}
                    >
                        <View style={{ width: 4, backgroundColor: theme.primary }} />
                        <View style={{ flex: 1, padding: Spacing.xl }}>
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.primary, 0.1) }]}>
                                        <AppIcon name="wallet" size={Size.sm} color={theme.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="caption" weight="bold" color="primary" style={{ letterSpacing: 0.5, marginBottom: 2 }}>{info.formulaItems[0].split(': ')[0].toUpperCase()}</AppText>
                                        <AppText variant="caption" color="secondary">{info.formulaItems[0].split(': ')[1]}</AppText>
                                    </View>
                                </View>
                                <AppText variant="subheading" color="primary" style={{ fontFamily: Typography.fonts.heading }}>{format(totalLiquidAssets)}</AppText>
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
                        <View style={{ flex: 1, padding: Spacing.xl }}>
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.primary, 0.1) }]}>
                                        <AppIcon name="trendingUp" size={Size.sm} color={theme.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="caption" weight="bold" color="primary" style={{ letterSpacing: 0.5, marginBottom: 2 }}>{labels.upcomingIncome.toUpperCase()}</AppText>
                                        <AppText variant="caption" color="secondary">{formulaItems[1].split(': ')[1]}</AppText>
                                    </View>
                                </View>
                                <AppText variant="subheading" color="primary" style={{ fontFamily: Typography.fonts.heading }}>{format(totalFutureInflow)}</AppText>
                            </View>
                        </View>
                    </TouchableOpacity>
                    {expandedSection === 'income' && (
                        <View style={styles.expandedContentRow}>
                            <View style={{ gap: Spacing.sm }}>
                                {incomeBreakdown.filter(inc => inc.amount !== 0).length > 0 ? (
                                    incomeBreakdown.filter(inc => inc.amount !== 0).map((inc, i) => (
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
                                    <AppText variant="caption" color="secondary" italic>{labels.noFutureIncome}</AppText>
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
                        <View style={{ flex: 1, padding: Spacing.xl }}>
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.warning, 0.1) }]}>
                                        <AppIcon name="lock" size={Size.sm} color={theme.warning} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="caption" weight="bold" color="warning" style={{ letterSpacing: 0.5, marginBottom: 2 }}>{labels.committedLine.split(' (')[0].toUpperCase()}</AppText>
                                        <AppText variant="caption" color="secondary">{formulaItems[2] ? formulaItems[2].split(': ')[1] : 'Bills and Budgets'}</AppText>
                                    </View>
                                </View>
                                <AppText variant="subheading" color="warning" style={{ fontFamily: Typography.fonts.heading }}>–{format(committedBudget + committedPlanned)}</AppText>
                            </View>
                        </View>
                    </TouchableOpacity>
                    {expandedSection === 'committed' && (
                        <View style={styles.expandedContentRow}>
                            <View style={{ gap: Spacing.md }}>
                                {committedBreakdown.filter(acc => acc.amount !== 0).sort((a, b) => b.amount - a.amount).map((acc, i) => (
                                    <View key={i} style={{ gap: Spacing.xs }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <AppText variant="caption" weight="bold">{acc.accountName}</AppText>
                                            <AppText variant="caption" weight="bold" color="warning">–{format(acc.amount)}</AppText>
                                        </View>
                                        <View style={{ gap: Spacing.sm, paddingLeft: Spacing.sm }}>
                                            {acc.details.filter(det => det.amount !== 0).map((det, di) => {
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
                                                                <AppText style={{ fontSize: 8, opacity: Opacity.medium, color: theme.textSecondary }}>
                                                                    {det.type === 'BUDGET' ? 'Budget' : det.type === 'PLANNED_PAYMENT' ? 'Bill' : 'Plan'}
                                                                </AppText>
                                                                {isPostIncome && (
                                                                    <View style={{ backgroundColor: withOpacity(theme.success, 0.1), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: Spacing.xs }}>
                                                                        <AppText weight="bold" style={{ fontSize: 8, color: theme.success }}>{labels.waitingForIncome}</AppText>
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
                        <View style={{ flex: 1, padding: Spacing.xl }}>
                            <View style={styles.breakdownRow}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                                    <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.error, 0.1) }]}>
                                        <AppIcon name="error" size={Size.sm} color={theme.error} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <AppText variant="caption" weight="bold" color="error" style={{ letterSpacing: 0.5, marginBottom: 2 }}>{labels.debtsBucket.toUpperCase()}</AppText>
                                        <AppText variant="caption" color="secondary">{formulaItems[3] ? formulaItems[3].split(': ')[1] : 'Short-term liabilities'}</AppText>
                                    </View>
                                </View>
                                <AppText variant="subheading" color="error" style={{ fontFamily: Typography.fonts.heading }}>–{format(committedLiabilities)}</AppText>
                            </View>
                        </View>
                    </TouchableOpacity>
                    {expandedSection === 'debts' && (
                        <View style={styles.expandedContentRow}>
                            <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.md, opacity: Opacity.heavy, fontStyle: 'italic' }}>
                                {labels.debtsHint}
                            </AppText>

                            <View style={{ gap: Spacing.md }}>
                                {debtBreakdown.filter(acc => acc.amount !== 0).map((acc, i) => (
                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View style={{ flex: 1 }}>
                                            <AppText variant="caption" weight="bold">{acc.accountName}</AppText>
                                            <AppText variant="caption" color="secondary">
                                                {acc.type === 'FALLBACK' ? labels.unplannedBalance : labels.scheduledCommitment}
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
                            padding: Spacing.xl,
                            backgroundColor: withOpacity(theme.primary, 0.08),
                            borderTopWidth: 1,
                            borderTopColor: withOpacity(theme.primary, 0.3),
                            borderStyle: 'solid',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <View style={{ flex: 1 }}>
                                <AppText variant="caption" weight="bold" color="primary" style={{ letterSpacing: 1.5, marginBottom: Spacing.xs }}>SAFE TO SPEND</AppText>
                                <AppText variant="caption" color="secondary" style={{ fontStyle: 'italic', opacity: Opacity.heavy }}>{labels.remainingCashBuffer}</AppText>
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
                                        <AppText variant="caption" color="secondary" style={{ marginTop: Spacing.xs / 2, lineHeight: 18 }}>{content}</AppText>
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
                                <Separator marginVertical="md" opacity={0.3} />
                                <View style={styles.breakdownRow}>
                                    <AppText variant="heading" style={{ fontSize: Typography.sizes.xl }}>Safe to Spend</AppText>
                                    <AppText variant="heading" style={{ color: theme.primary, fontSize: Typography.sizes.xl }}>{format(safeToSpend)}</AppText>
                                </View>
                            </View>

                            <View style={{ marginTop: Spacing.lg, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: withOpacity(theme.border, 0.2), borderStyle: 'dashed' }}>
                                <AppText variant="caption" italic color="secondary" style={{ lineHeight: 18 }}>
                                    Logic: Future income is used to "buffer" your bills. Today's cash is only reserved if future income won't cover an obligation before its due date.
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
                                            <AppText variant="caption" weight="bold" color="success">+{format(inc.amount)}</AppText>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                )}

                {selectedLegendItem === 'committed' && (
                    <View style={styles.modalSection}>
                        <AppText variant="body" style={{ marginBottom: Spacing.md }}>
                            {AppConfig.strings.dashboard.legendDetails.committedDesc}
                        </AppText>

                        <View style={{ gap: Spacing.md }}>
                            {(() => {
                                // Flatten details across all accounts for unified grouping
                                const flatCommitted = committedBreakdown.flatMap(acc =>
                                    acc.details
                                        .filter(d => d.amount !== 0)
                                        .map(d => ({
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
                                                <AppText variant="caption" weight="bold" color="warning">{format(total)}</AppText>
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
                                                            {format(item.amount)}
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
                            {/* Summary rows */}
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="medium">{labels.creditCardStatements}</AppText>
                                <AppText variant="body" weight="bold">{format(committedLiabilitiesCC)}</AppText>
                            </View>
                            <View style={styles.breakdownRow}>
                                <AppText variant="body" weight="medium">{labels.otherLiquidLiabilities}</AppText>
                                <AppText variant="body" weight="bold">{format(committedLiabilitiesOther)}</AppText>
                            </View>

                            <Separator marginVertical="xl" opacity={0.3} />

                            {/* Grouped Breakdowns */}
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
                                                <AppText variant="caption" weight="bold" color="error">{format(total)}</AppText>
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
                                                            {format(item.amount)}
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
                                <AppText variant="body" weight="bold" color="error" style={{ fontSize: Typography.sizes.lg }}>{format(committedLiabilities)}</AppText>
                            </View>
                            <Separator marginVertical="md" opacity={0.3} />
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
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.md,
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
