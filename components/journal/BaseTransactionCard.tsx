import { AppCard, AppText, Badge } from '@/components/core';
import { Spacing, withOpacity } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { JournalDisplayType } from '@/src/domain/accounting/JournalPresenter';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface BaseTransactionCardProps {
    title: string;
    amount: number;
    currencyCode: string;
    transactionDate: number | Date;
    displayType: JournalDisplayType;
    accounts: Array<{
        id: string;
        name: string;
        accountType: string;
    }>;
    notes?: string;
    isIncrease?: boolean;
    onPress?: () => void;
}

/**
 * BaseTransactionCard - Unified layout for all transaction-like items
 * Inspired by Ivy Wallet's premium card aesthetic.
 */
export const BaseTransactionCard = ({
    title,
    amount,
    currencyCode,
    transactionDate,
    displayType,
    accounts,
    notes,
    isIncrease,
    onPress,
}: BaseTransactionCardProps) => {
    const { theme } = useTheme();
    const formattedDate = formatDate(transactionDate, { includeTime: true });
    const formattedAmount = CurrencyFormatter.format(amount, currencyCode);

    // Determine icon and colors based on display type
    let typeIcon: keyof typeof Ionicons.glyphMap = 'document-text';
    let typeColor: string = theme.textSecondary;

    if (displayType === JournalDisplayType.INCOME) {
        typeIcon = 'arrow-up';
        typeColor = theme.income;
    } else if (displayType === JournalDisplayType.EXPENSE) {
        typeIcon = 'arrow-down';
        typeColor = theme.expense;
    } else if (displayType === JournalDisplayType.TRANSFER) {
        typeIcon = 'swap-horizontal';
        typeColor = theme.primary;
    }

    const content = (
        <View style={styles.cardContent}>
            {/* Header: Badges */}
            <View style={styles.badgeRow}>
                {accounts.slice(0, 2).map((acc) => (
                    <Badge
                        key={acc.id}
                        variant={acc.accountType.toLowerCase() as any}
                        size="sm"
                        icon={acc.accountType === 'EXPENSE' ? 'pricetag' : 'wallet'}
                    >
                        {acc.name}
                    </Badge>
                ))}
                {accounts.length > 2 && (
                    <Badge variant="default" size="sm">
                        +{accounts.length - 2} more
                    </Badge>
                )}
            </View>

            {/* Content: Title & Notes */}
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

            {/* Footer: Icon + Amount + Date */}
            <View style={styles.footerRow}>
                <View style={styles.amountContainer}>
                    <View style={[styles.iconCircle, { backgroundColor: withOpacity(typeColor, 0.2) }]}>
                        <Ionicons name={typeIcon} size={16} color={typeColor} />
                    </View>
                    <AppText
                        variant="subheading"
                        weight="bold"
                        style={{ color: typeColor }}
                    >
                        {displayType === JournalDisplayType.INCOME ? '+ ' : displayType === JournalDisplayType.EXPENSE ? '− ' : ''}
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
                <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
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
        fontSize: 16,
    },
    notes: {
        marginTop: 4,
        fontSize: 13,
        opacity: 0.8,
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
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.sm,
    },
    date: {
        fontSize: 11,
    },
});
