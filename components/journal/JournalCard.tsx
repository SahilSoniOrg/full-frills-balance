import { AppCard, AppText, Badge, IvyIcon } from '@/components/core';
import { Shape, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import Journal from '@/src/data/models/Journal';
import { JournalDisplayType, JournalPresenter } from '@/src/domain/accounting/JournalPresenter';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatShortDate } from '@/src/utils/dateUtils';
import { preferences } from '@/src/utils/preferences';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalCardProps {
    journal: Journal;
    onPress: (journal: Journal) => void;
}

/**
 * JournalCard - High-fidelity card for journal entries
 * Inspired by Ivy Wallet's TransactionCard
 */
export const JournalCard = ({ journal, onPress }: JournalCardProps) => {
    const { theme } = useTheme();
    const formattedDate = formatShortDate(journal.journalDate);

    // Use denormalized fields
    const totalAmount = journal.totalAmount || 0;
    const count = journal.transactionCount || 0;
    const displayType = (journal.displayType as JournalDisplayType) || JournalDisplayType.MIXED;

    const presentation = JournalPresenter.getPresentation(displayType, theme);
    const typeColor = presentation.colorHex;
    const typeLabel = JournalPresenter.getIconLabel(displayType);

    return (
        <AppCard
            elevation="sm"
            style={[styles.container, { backgroundColor: theme.surface }]}
            padding="none"
        >
            <TouchableOpacity onPress={() => onPress(journal)} style={styles.content}>
                {/* Left side: Icon */}
                <View style={styles.iconContainer}>
                    <IvyIcon
                        label={typeLabel}
                        color={typeColor}
                        size={32}
                    />
                </View>

                {/* Right side: Content */}
                <View style={styles.mainContent}>
                    <View style={styles.header}>
                        <AppText variant="body" weight="bold" numberOfLines={1} style={styles.title}>
                            {journal.description || 'Transaction'}
                        </AppText>
                        <AppText variant="body" weight="bold" style={[styles.amountText, { color: typeColor === theme.text ? theme.text : typeColor }]}>
                            {CurrencyFormatter.format(totalAmount, journal.currencyCode)}
                        </AppText>
                    </View>

                    <View style={styles.footer}>
                        <AppText variant="caption" color="secondary">
                            {formattedDate}
                        </AppText>
                        <View style={styles.spacer} />
                        <View style={styles.badgeRow}>
                            {journal.currencyCode !== (preferences.defaultCurrencyCode || 'USD') && (
                                <Badge variant="default" size="sm">
                                    <AppText variant="caption" style={{ fontSize: 10 }}>{journal.currencyCode}</AppText>
                                </Badge>
                            )}
                            <Badge variant="default" size="sm">
                                <AppText variant="caption" style={{ fontSize: 10 }}>{count} {count === 1 ? 'entry' : 'entries'}</AppText>
                            </Badge>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.sm,
        borderRadius: Shape.radius.lg,
        overflow: 'hidden',
    },
    content: {
        padding: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        marginRight: Spacing.md,
    },
    mainContent: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    title: {
        flex: 1,
        marginRight: Spacing.sm,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    spacer: {
        flex: 1,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    amountText: {
        textAlign: 'right',
    },
});
