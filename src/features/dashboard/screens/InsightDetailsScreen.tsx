import { TransactionListView } from '@/src/components/common/TransactionListView';
import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useInsightDetailsViewModel } from '../hooks/useInsightDetailsViewModel';

export default function InsightDetailsScreen() {
    const { theme, fonts } = useTheme();
    const params = useLocalSearchParams<{
        id: string;
        message: string;
        description: string;
        suggestion: string;
        journalIds: string;
        severity: string;
        amount?: string;
        currencyCode?: string;
    }>();

    const journalIds = useMemo(() =>
        params.journalIds ? params.journalIds.split(',') : []
        , [params.journalIds]);

    const { items, isLoading } = useInsightDetailsViewModel({ journalIds });
    const amount = useMemo(() => {
        if (!params.amount) return null;
        const parsed = Number(params.amount);
        return Number.isFinite(parsed) ? parsed : null;
    }, [params.amount]);

    const severityMeta = useMemo(() => {
        if (params.severity === 'high') {
            return { color: theme.error, label: 'Action needed' };
        }
        if (params.severity === 'medium') {
            return { color: theme.warning, label: 'Watch' };
        }
        return { color: theme.primary, label: 'Info' };
    }, [params.severity, theme.error, theme.primary, theme.warning]);

    const listHeader = (
        <View style={styles.headerContainer}>
            <View style={[
                styles.hero,
                {
                    backgroundColor: withOpacity(severityMeta.color, Opacity.soft),
                    borderColor: severityMeta.color
                }
            ]}>
                <View style={[styles.severityChip, { backgroundColor: withOpacity(severityMeta.color, Opacity.hover) }]}>
                    <AppIcon name="alert" size={12} color={severityMeta.color} />
                    <AppText variant="caption" weight="medium" style={{ color: severityMeta.color }}>
                        {severityMeta.label}
                    </AppText>
                </View>
                <View style={[styles.iconCircle, { backgroundColor: withOpacity(severityMeta.color, Opacity.hover) }]}>
                    <AppIcon
                        name={params.id?.startsWith('sub_') ? 'repeat' : 'trendingUp'}
                        size={Size.md}
                        color={severityMeta.color}
                    />
                </View>
                <AppText variant="title" style={{ fontFamily: fonts.bold, marginTop: Spacing.md }}>
                    {params.message}
                </AppText>
                {amount !== null ? (
                    <View style={[styles.amountCard, { backgroundColor: withOpacity(severityMeta.color, Opacity.hover) }]}>
                        <AppText variant="caption" weight="medium" style={{ color: severityMeta.color }}>
                            Impact
                        </AppText>
                        <AppText variant="title" style={{ color: severityMeta.color, fontFamily: fonts.bold }}>
                            {CurrencyFormatter.format(amount, params.currencyCode)}
                        </AppText>
                    </View>
                ) : null}
                {params.description ? (
                    <AppText variant="body" color="secondary" style={styles.description}>
                        Why this appeared: {params.description}
                    </AppText>
                ) : null}
                <View style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.actionHeader}>
                        <AppIcon name="checkCircle" size={16} color={theme.textSecondary} />
                        <AppText variant="caption" color="secondary" weight="semibold">
                            Recommended action
                        </AppText>
                    </View>
                    <AppText variant="body" color="secondary" style={styles.suggestion}>
                        {params.suggestion}
                    </AppText>
                </View>
                <AppText variant="caption" color="secondary" style={styles.basisText}>
                    Based on last {AppConfig.insights.lookbackDays} days of activity
                </AppText>
            </View>
            <AppText variant="subheading" color="secondary" style={styles.listTitle}>
                {AppConfig.strings.dashboard.triggeringTransactionsTitle}
            </AppText>
        </View>
    );

    return (
        <Screen title="Insight Details" withPadding={false}>
            <TransactionListView
                items={items}
                isLoading={isLoading}
                ListHeaderComponent={listHeader}
                contentContainerStyle={styles.listContent}
                emptyTitle="No transactions found"
                emptySubtitle="The transactions for this insight might have been deleted."
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    headerContainer: {
        padding: Spacing.lg,
    },
    hero: {
        padding: Spacing.xl,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    severityChip: {
        alignSelf: 'center',
        borderRadius: Spacing.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs / 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs / 2,
        marginBottom: Spacing.sm,
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    description: {
        textAlign: 'center',
        marginTop: Spacing.sm,
    },
    amountCard: {
        marginTop: Spacing.md,
        borderRadius: 12,
        width: '100%',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
    },
    actionCard: {
        width: '100%',
        borderRadius: 12,
        borderWidth: 1,
        padding: Spacing.md,
        marginTop: Spacing.md,
    },
    actionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginBottom: Spacing.xs,
    },
    suggestion: {
        lineHeight: 20,
    },
    basisText: {
        marginTop: Spacing.sm,
        opacity: Opacity.medium,
    },
    listTitle: {
        marginBottom: Spacing.md,
    },
    listContent: {
        paddingBottom: Spacing.xl * 2,
    },
});
