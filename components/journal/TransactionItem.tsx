import { AppCard, AppText, Badge, IvyIcon } from '@/components/core';
import { Shape, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { TransactionWithAccountInfo } from '@/src/types/readModels';
import { formatDate } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface TransactionItemProps {
    transaction: TransactionWithAccountInfo;
}

/**
 * TransactionItem - Premium row component for individual transactions
 * Inspired by Ivy Wallet's list items
 */
export const TransactionItem = ({ transaction }: TransactionItemProps) => {
    const { theme } = useTheme();

    const formattedDate = formatDate(transaction.transactionDate, { includeTime: true });
    const formattedAmount = transaction.amount ? Math.abs(transaction.amount).toFixed(2) : '0.00';
    const formattedRunningBalance = transaction.runningBalance !== undefined && transaction.runningBalance !== null
        ? transaction.runningBalance.toFixed(2)
        : null;

    const isIncrease = transaction.isIncrease ?? false;
    const typeColor = isIncrease ? theme.income : theme.expense;
    const typeLabel = isIncrease ? '+' : '−';
    const statusColor = typeColor; // IvyIcon color

    return (
        <AppCard
            elevation="none"
            style={[styles.container, { backgroundColor: theme.surface }]}
        >
            <View style={styles.row}>
                {/* Status Icon */}
                <IvyIcon
                    label={typeLabel}
                    color={statusColor}
                    size={32}
                    style={{ marginRight: Spacing.md }}
                />

                <View style={styles.content}>
                    <View style={styles.headerRow}>
                        <AppText variant="body" style={styles.accountName} numberOfLines={1}>
                            {transaction.displayTitle || transaction.accountName}
                        </AppText>
                        <Badge variant={(transaction.counterAccountType || transaction.accountType || '').toLowerCase() as any} size="sm">
                            {transaction.counterAccountType || transaction.accountType}
                        </Badge>
                    </View>

                    <AppText variant="caption" color="secondary">
                        {formattedDate}
                    </AppText>
                </View>

                <View style={styles.amountInfo}>
                    <AppText
                        variant="body"
                        style={[styles.amountText, { color: typeColor }]}
                    >
                        {typeLabel} {formattedAmount}
                    </AppText>
                    {formattedRunningBalance && (
                        <AppText variant="caption" color="tertiary">
                            {formattedRunningBalance}
                        </AppText>
                    )}
                </View>
            </View>

            {(transaction.notes || transaction.journalDescription) && (
                <View style={styles.notesSection}>
                    <AppText variant="caption" color="secondary" italic>
                        {transaction.notes || transaction.journalDescription}
                    </AppText>
                </View>
            )}
        </AppCard>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.sm,
        borderRadius: Shape.radius.lg,
        padding: Spacing.md,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    accountName: {
        fontWeight: '600',
        marginRight: Spacing.sm,
    },
    amountInfo: {
        alignItems: 'flex-end',
    },
    amountText: {
        fontWeight: 'bold',
        fontSize: 16,
    },
    notesSection: {
        marginTop: Spacing.sm,
        paddingLeft: 40, // Match status circle + margin
    },
});
