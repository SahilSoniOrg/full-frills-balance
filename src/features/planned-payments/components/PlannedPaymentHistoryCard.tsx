import { AppCard, AppIcon, AppText, Badge, IconName } from '@/src/components/core';
import { Opacity, Shape, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface PlannedPaymentHistoryCardProps {
    journalId: string;
    journalTitle: string;
    journalAmount: number;
    currencyCode: string;
    journalDate: number | Date;

    // The reference planned payment info to compare against
    plannedAmount: number;
    plannedTitle: string;

    presentation: {
        label: string;      // e.g. "Scheduled" or "Posted"
        typeIcon: IconName; // e.g. 'arrowUp', 'arrowDown'
        typeColor: string;  // e.g. 'income', 'expense', 'textSecondary'
    };

    onPress?: () => void;
}

/**
 * Custom Card designed specifically for Planned Payment History.
 * Emphasizes the Date (acting as title) and highlights if the generated journal
 * deviated from the base rule (e.g. amount changed).
 */
export const PlannedPaymentHistoryCard = ({
    journalTitle,
    journalAmount,
    currencyCode,
    journalDate,
    plannedAmount,
    plannedTitle,
    presentation,
    onPress,
}: PlannedPaymentHistoryCardProps) => {
    const { theme, themeMode } = useTheme();
    const formattedDate = formatDate(journalDate, { includeTime: true });

    // Check for deviations from the base rule configuration
    const isAmountDeviated = Math.abs(journalAmount - plannedAmount) > 0.01; // float safety
    const isTitleDeviated = journalTitle !== plannedTitle;

    const formattedAmount = CurrencyFormatter.format(journalAmount, currencyCode);

    const content = (
        <View style={styles.cardContent}>
            <View style={styles.headerRow}>
                {/* Date is the primary identifier for history rows */}
                <AppText variant="subheading" weight="bold" style={styles.dateTitle} numberOfLines={1}>
                    {formattedDate}
                </AppText>

                <Badge
                    variant="default"
                    size="sm"
                    backgroundColor={withOpacity(theme[presentation.typeColor as keyof typeof theme] as string, themeMode === 'dark' ? Opacity.muted : Opacity.soft)}
                    textColor={theme[presentation.typeColor as keyof typeof theme] as string}
                    icon={presentation.typeIcon}
                    style={{ borderRightWidth: 0 }}
                >
                    {presentation.label}
                </Badge>
            </View>

            <View style={styles.detailsSection}>
                <View style={styles.row}>
                    <View style={styles.detailItem}>
                        <AppText variant="caption" color="secondary" style={styles.label}>
                            AMOUNT
                        </AppText>
                        <View style={styles.amountContainer}>
                            <AppText
                                variant="body"
                                weight="bold"
                                style={{ color: theme[presentation.typeColor as keyof typeof theme] as string }}
                            >
                                {formattedAmount}
                            </AppText>
                            {isAmountDeviated && (
                                <View style={[styles.badgeContainer, { backgroundColor: withOpacity(theme.warning, Opacity.soft) }]}>
                                    <AppIcon name="alert-circle" size={12} color={theme.warning} />
                                </View>
                            )}
                        </View>
                        {isAmountDeviated && (
                            <AppText variant="caption" color="warning" style={styles.deviationText}>
                                Originally {CurrencyFormatter.format(plannedAmount, currencyCode)}
                            </AppText>
                        )}
                    </View>

                    <View style={styles.detailItem}>
                        <AppText variant="caption" color="secondary" style={styles.label}>
                            TITLE
                        </AppText>
                        <View style={styles.titleContainer}>
                            <AppText variant="body" numberOfLines={1}>
                                {journalTitle || 'No Title'}
                            </AppText>
                            {isTitleDeviated && (
                                <View style={[styles.badgeContainer, { backgroundColor: withOpacity(theme.primary, Opacity.soft), marginLeft: Spacing.xs }]}>
                                    <AppIcon name="pencil" size={12} color={theme.primary} />
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );

    return (
        <AppCard
            elevation="sm"
            padding="none"
            radius="r3"
            style={[styles.container, { backgroundColor: theme.surface }]}
        >
            {onPress ? (
                <TouchableOpacity onPress={onPress} activeOpacity={Opacity.heavy}>
                    {content}
                </TouchableOpacity>
            ) : (
                content
            )}
        </AppCard>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.md,
        overflow: 'hidden',
    },
    cardContent: {
        padding: Spacing.lg,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    dateTitle: {
        fontSize: Typography.sizes.lg,
        flex: 1,
        marginRight: Spacing.sm,
    },
    detailsSection: {
        backgroundColor: withOpacity('#000', 0.02),
        padding: Spacing.md,
        borderRadius: Shape.radius.md,
    },
    row: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    detailItem: {
        flex: 1,
    },
    label: {
        marginBottom: Spacing.xs,
        fontSize: Typography.sizes.xs,
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
    },
    badgeContainer: {
        padding: 2,
        borderRadius: Shape.radius.full,
    },
    deviationText: {
        fontSize: 10,
        marginTop: 2,
        opacity: Opacity.heavy,
    }
});
