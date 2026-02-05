import { AppCard, AppIcon, AppText, Badge, IconName } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface TransactionPresentation {
    label: string;
    typeIcon: IconName;
    typeColor: string;
    amountPrefix?: string;
}

export interface TransactionCardProps {
    title: string;
    amount: number;
    currencyCode: string;
    transactionDate: number | Date;
    presentation: TransactionPresentation;
    accounts: {
        id: string;
        name: string;
        accountType: string;
        icon?: string;
        role?: 'SOURCE' | 'DESTINATION' | 'NEUTRAL';
    }[];
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
    accounts,
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
                    backgroundColor={withOpacity(presentation.typeColor, themeMode === 'dark' ? Opacity.muted : Opacity.soft)}
                    textColor={presentation.typeColor}
                    icon={presentation.typeIcon}
                    style={{ borderRightWidth: 1, borderRightColor: withOpacity(theme.border, Opacity.medium), paddingRight: Spacing.sm }}
                >
                    {presentation.label}
                </Badge>

                {accounts.slice(0, 2).map((acc) => {
                    const isSource = acc.role === 'SOURCE';
                    const isDest = acc.role === 'DESTINATION';
                    const showPrefix = isSource ? 'From: ' : (isDest ? 'To: ' : '');

                    return (
                        <Badge
                            key={acc.id}
                            variant={acc.accountType.toLowerCase() as any}
                            size="sm"
                            icon={acc.icon as IconName || (acc.accountType === 'EXPENSE' ? 'tag' : 'wallet')}
                        >
                            {showPrefix}{acc.name}
                        </Badge>
                    );
                })}
                {accounts.length > 2 && (
                    <Badge variant="default" size="sm">
                        +{accounts.length - 2} more
                    </Badge>
                )}
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
                    <View style={[styles.iconCircle, { backgroundColor: withOpacity(presentation.typeColor, Opacity.soft) }]}>
                        <AppIcon name={presentation.typeIcon} size={16} color={presentation.typeColor} />
                    </View>
                    <AppText
                        variant="subheading"
                        weight="bold"
                        style={{ color: presentation.typeColor }}
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
