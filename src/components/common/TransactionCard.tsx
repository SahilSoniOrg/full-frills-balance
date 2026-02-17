import { AppCard, AppIcon, AppText, Badge, IconName } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import { ComponentVariant } from '@/src/utils/style-helpers';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface TransactionBadge {
    text: string;
    icon?: IconName;
    colorKey?: string; // semantic theme key
    variant?: ComponentVariant;
}

export interface TransactionCardProps {
    title: string;
    amount: number;
    currencyCode: string;
    transactionDate: number | Date;
    presentation: {
        label: string;
        typeIcon: IconName;
        typeColor: string; // semantic key (e.g., 'income', 'expense')
        amountPrefix?: string;
    };
    badges: TransactionBadge[];
    notes?: string;
    onPress?: () => void;
}

/**
 * TransactionCard - Unified layout for all transaction-like items
 */
export const TransactionCard = ({
    title,
    amount,
    currencyCode,
    transactionDate,
    presentation,
    badges = [],
    notes,
    onPress,
}: TransactionCardProps) => {
    const { theme, themeMode } = useTheme();
    const formattedDate = formatDate(transactionDate, { includeTime: true });
    const formattedAmount = CurrencyFormatter.format(amount, currencyCode);

    const content = (
        <View style={styles.cardContent}>
            <View style={styles.badgeRow}>
                <Badge
                    variant="default"
                    size="sm"
                    backgroundColor={withOpacity(theme[presentation.typeColor as keyof typeof theme] as string, themeMode === 'dark' ? Opacity.muted : Opacity.soft)}
                    textColor={theme[presentation.typeColor as keyof typeof theme] as string}
                    icon={presentation.typeIcon}
                    style={{ borderRightWidth: 1, borderRightColor: withOpacity(theme.border, Opacity.medium), paddingRight: Spacing.sm }}
                >
                    {presentation.label}
                </Badge>

                {badges.map((badge, idx) => (
                    <Badge
                        key={`${badge.text}-${idx}`}
                        variant={badge.variant}
                        size="sm"
                        backgroundColor={badge.colorKey ? theme[badge.colorKey as keyof typeof theme] as string : undefined}
                        icon={badge.icon}
                    >
                        {badge.text}
                    </Badge>
                ))}
            </View>

            <View style={styles.textSection}>
                <AppText variant="body" weight="bold" style={styles.title} numberOfLines={1}>
                    {title}
                </AppText>
                {notes && (
                    <AppText variant="caption" color="secondary" style={styles.notes} numberOfLines={2}>
                        {notes}
                    </AppText>
                )}
            </View>

            <View style={styles.footerRow}>
                <View style={styles.amountContainer}>
                    <View style={[styles.iconCircle, { backgroundColor: withOpacity(theme[presentation.typeColor as keyof typeof theme] as string, Opacity.soft) }]}>
                        <AppIcon name={presentation.typeIcon} size={Size.iconXs} color={theme[presentation.typeColor as keyof typeof theme] as string} />
                    </View>
                    <AppText
                        variant="subheading"
                        weight="bold"
                        style={{ color: theme[presentation.typeColor as keyof typeof theme] as string }}
                    >
                        {presentation.amountPrefix || ''}
                        {formattedAmount}
                    </AppText>
                </View>

                <AppText variant="caption" color="tertiary" style={styles.date}>
                    {formattedDate}
                </AppText>
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
    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    textSection: {
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.sizes.base,
    },
    notes: {
        marginTop: Spacing.xs,
        fontSize: Typography.sizes.xs,
        opacity: Opacity.heavy,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: Spacing.xs,
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconCircle: {
        width: Size.iconLg,
        height: Size.iconLg,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.sm,
    },
    date: {
        fontSize: Typography.sizes.xs,
    },
});
