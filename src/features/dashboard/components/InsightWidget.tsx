import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { insightService, Pattern } from '@/src/services/insight-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { EmergencyFundPopupModal } from './EmergencyFundPopupModal';

interface InsightWidgetProps {
    patterns: Pattern[];
    hideManageDismissed?: boolean;
}

export const InsightWidget = ({ patterns, hideManageDismissed = false }: InsightWidgetProps) => {
    const { theme, fonts } = useTheme();
    const router = useRouter();
    const [isEmergencyFundInfoVisible, setEmergencyFundInfoVisible] = React.useState(false);

    const handleDismiss = async (id: string) => {
        await insightService.dismissPattern(id);
    };

    const isEmergencyFundPattern = (pattern: Pattern) => pattern.id === 'no_emergency_fund';

    const handleOpenInsightDetails = (pattern: Pattern) => {
        router.push({
            pathname: '/insight-details',
            params: {
                id: pattern.id,
                message: pattern.message,
                description: pattern.description,
                suggestion: pattern.suggestion,
                journalIds: pattern.journalIds.join(','),
                severity: pattern.severity,
                amount: typeof pattern.amount === 'number' ? String(pattern.amount) : undefined,
                currencyCode: pattern.currencyCode,
            }
        });
    };

    const handleEmergencyFundPress = () => setEmergencyFundInfoVisible(true);

    const handlePress = (pattern: Pattern) => {
        if (isEmergencyFundPattern(pattern)) {
            handleEmergencyFundPress();
            return;
        }
        handleOpenInsightDetails(pattern);
    };

    if (patterns.length === 0) return null;

    const handleManageDismissed = () => {
        router.push('/insights');
    };

    const getSeverityMeta = (severity: Pattern['severity']) => {
        if (severity === 'high') {
            return {
                color: theme.error,
                label: 'Action needed',
                chipBg: withOpacity(theme.error, Opacity.hover),
            };
        }
        if (severity === 'medium') {
            return {
                color: theme.warning,
                label: 'Watch',
                chipBg: withOpacity(theme.warning, Opacity.hover),
            };
        }
        return {
            color: theme.primary,
            label: 'Info',
            chipBg: withOpacity(theme.primary, Opacity.hover),
        };
    };

    const getPrimaryActionLabel = (patternType: Pattern['type']) => {
        if (patternType === 'subscription-amnesiac') {
            return 'Review subscription';
        }
        if (patternType === 'slow-leak') {
            return 'Check category spend';
        }
        if (patternType === 'lifestyle-drift') {
            return 'Plan emergency fund';
        }
        return 'Open insight';
    };

    return (
        <>
            <View style={styles.container}>
                <View style={styles.titleRow}>
                    <View style={styles.titleGroup}>
                        <AppText variant="subheading" color="secondary" style={styles.title}>
                            {AppConfig.strings.dashboard.insightsTitle}
                        </AppText>
                        <View style={[styles.countChip, { backgroundColor: withOpacity(theme.primary, Opacity.soft) }]}>
                            <AppText variant="caption" style={{ color: theme.textSecondary, fontFamily: fonts.medium }}>
                                {patterns.length}
                            </AppText>
                        </View>
                    </View>
                    {!hideManageDismissed && (
                        <TouchableOpacity
                            onPress={handleManageDismissed}
                            style={[styles.managePill, { backgroundColor: theme.surfaceSecondary }]}
                            accessibilityRole="button"
                            accessibilityLabel="Manage dismissed insights"
                        >
                            <AppIcon name="history" size={14} color={theme.textSecondary} />
                            <AppText variant="caption" color="secondary">
                                {AppConfig.strings.dashboard.manageDismissed}
                            </AppText>
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.listContent}>
                    {patterns.map(pattern => {
                        const severity = getSeverityMeta(pattern.severity);
                        return (
                            <AppCard
                                key={pattern.id}
                                elevation="sm"
                                padding="none"
                                style={[
                                    styles.card,
                                    {
                                        borderColor: theme.border,
                                        backgroundColor: theme.surface,
                                    }
                                ]}
                            >
                                <Pressable
                                    onPress={() => handlePress(pattern)}
                                    style={styles.cardPressable}
                                    android_ripple={{ color: withOpacity(theme.primary, Opacity.soft) }}
                                >
                                    <View style={styles.metaRow}>
                                        <View style={[styles.severityChip, { backgroundColor: severity.chipBg }]}>
                                            <AppIcon name="alert" size={12} color={severity.color} />
                                            <AppText variant="caption" weight="medium" style={{ color: severity.color }}>
                                                {severity.label}
                                            </AppText>
                                        </View>
                                    </View>

                                    <View style={styles.header}>
                                        <View style={styles.iconTitle}>
                                            <View style={[styles.iconBadge, { backgroundColor: withOpacity(severity.color, Opacity.hover) }]}>
                                                <AppIcon
                                                    name={pattern.type === 'subscription-amnesiac' ? 'history' : 'trendingUp'}
                                                    size={Size.xs}
                                                    color={severity.color}
                                                />
                                            </View>
                                            <AppText variant="body" weight="semibold" numberOfLines={2} style={styles.headline}>
                                                {pattern.message}
                                            </AppText>
                                        </View>
                                    </View>

                                    {typeof pattern.amount === 'number' ? (
                                        <View style={[styles.amountCard, { backgroundColor: withOpacity(severity.color, Opacity.hover) }]}>
                                            <AppText variant="caption" weight="medium" style={{ color: severity.color }}>
                                                Impact
                                            </AppText>
                                            <AppText variant="subheading" style={[styles.amountValue, { color: severity.color, fontFamily: fonts.bold }]}>
                                                {CurrencyFormatter.format(pattern.amount, pattern.currencyCode)}
                                            </AppText>
                                        </View>
                                    ) : null}

                                    <AppText variant="caption" color="secondary" style={styles.reason} numberOfLines={2}>
                                        Why this appeared: {pattern.description}
                                    </AppText>

                                    <View style={styles.contextRow}>
                                        <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.contextText}>
                                            Based on last {AppConfig.insights.lookbackDays} days
                                        </AppText>
                                        {pattern.journalIds.length > 0 ? (
                                            <AppText variant="caption" color="secondary" style={styles.contextText}>
                                                {pattern.journalIds.length} triggers
                                            </AppText>
                                        ) : null}
                                    </View>

                                    <View style={[styles.footer, { borderTopColor: theme.border }]}>
                                        <TouchableOpacity
                                            onPress={() => handlePress(pattern)}
                                            style={[styles.primaryCta, { backgroundColor: withOpacity(severity.color, Opacity.hover) }]}
                                            accessibilityRole="button"
                                            accessibilityLabel={getPrimaryActionLabel(pattern.type)}
                                        >
                                            <AppText variant="caption" weight="medium" style={{ color: severity.color }}>
                                                {getPrimaryActionLabel(pattern.type)}
                                            </AppText>
                                            <AppIcon name="chevronRight" size={14} color={severity.color} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                handleDismiss(pattern.id);
                                            }}
                                            style={[styles.dismissPill, { backgroundColor: theme.surfaceSecondary }]}
                                            accessibilityRole="button"
                                            accessibilityLabel="Dismiss insight"
                                        >
                                            <AppIcon name="close" size={14} color={theme.textSecondary} />
                                            <AppText variant="caption" color="secondary">Dismiss</AppText>
                                        </TouchableOpacity>
                                    </View>

                                    <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.tipText}>
                                        Next step: {pattern.suggestion}
                                    </AppText>
                                </Pressable>
                            </AppCard>
                        );
                    })}
                </View>
            </View>

            <EmergencyFundPopupModal
                visible={isEmergencyFundInfoVisible}
                onClose={() => setEmergencyFundInfoVisible(false)}
                onCreateAccount={() => {
                    setEmergencyFundInfoVisible(false);
                    router.push('/account-creation?type=ASSET');
                }}
            />
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.xl,
    },
    titleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    title: {
    },
    countChip: {
        minWidth: 28,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.xs,
    },
    card: {
        marginBottom: Spacing.sm,
        overflow: 'hidden',
        borderWidth: 1,
    },
    cardPressable: {
        position: 'relative',
        padding: Spacing.md,
    },
    listContent: {
        gap: Spacing.sm,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    iconTitle: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.xs,
        flex: 1,
        minWidth: 0,
    },
    headline: {
        flex: 1,
    },
    iconBadge: {
        width: Size.md,
        height: Size.md,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    amountCard: {
        borderRadius: 12,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    amountValue: {
        marginTop: Spacing.xs / 2,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    severityChip: {
        alignSelf: 'flex-start',
        borderRadius: Spacing.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs / 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs / 2,
    },
    reason: {
        marginBottom: Spacing.sm,
        opacity: Opacity.medium,
    },
    contextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    contextText: {
        opacity: Opacity.medium,
    },
    tipText: {
        marginTop: Spacing.sm,
        opacity: Opacity.medium,
    },
    footer: {
        borderTopWidth: 1,
        paddingTop: Spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.sm,
    },
    primaryCta: {
        borderRadius: Spacing.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs / 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        flexShrink: 1,
    },
    dismissPill: {
        borderRadius: Spacing.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs / 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    managePill: {
        borderRadius: Spacing.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs / 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
});
