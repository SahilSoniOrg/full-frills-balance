import { AppCard, AppText, Badge, IvyIcon } from '@/components/core';
import { Shape, Spacing, ThemeMode, useThemeColors } from '@/constants';
import Journal from '@/src/data/models/Journal';
import { JournalDisplayType, JournalPresenter } from '@/src/domain/accounting/JournalPresenter';
import { formatShortDate } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalCardProps {
    journal: Journal;
    themeMode: ThemeMode;
    onPress: (journal: Journal) => void;
}

/**
 * JournalCard - High-fidelity card for journal entries
 * Inspired by Ivy Wallet's TransactionCard
 */
export const JournalCard = ({ journal, themeMode, onPress }: JournalCardProps) => {
    const theme = useThemeColors(themeMode);
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
            style={styles.container}
            themeMode={themeMode}
        >
            <TouchableOpacity onPress={() => onPress(journal)} style={styles.content}>
                {/* Header: Date & Count */}
                <View style={styles.header}>
                    <View style={styles.badgeRow}>
                        {journal.currencyCode !== 'USD' && (
                            <Badge variant="default" size="sm" themeMode={themeMode}>
                                {journal.currencyCode}
                            </Badge>
                        )}
                        <Badge variant="default" size="sm" themeMode={themeMode}>
                            {count} {count === 1 ? 'entry' : 'entries'}
                        </Badge>
                    </View>
                    <View style={{ flex: 1 }} />
                    <AppText variant="caption" color="secondary" themeMode={themeMode}>
                        {formattedDate}
                    </AppText>
                </View>

                {/* Title / Description */}
                <View style={styles.titleSection}>
                    <AppText variant="heading" themeMode={themeMode} numberOfLines={1}>
                        {journal.description || 'Journal Entry'}
                    </AppText>
                </View>

                {/* Amount Row: Ivy Style */}
                <View style={styles.amountRow}>
                    <IvyIcon
                        label={typeLabel}
                        color={typeColor}
                        size={40}
                        style={{ marginRight: Spacing.md }}
                    />

                    <View style={styles.amountInfo}>
                        <AppText variant="xl" themeMode={themeMode} style={styles.amountText}>
                            {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <AppText variant="body" color="secondary" themeMode={themeMode}> {journal.currencyCode}</AppText>
                        </AppText>
                    </View>
                </View>
            </TouchableOpacity>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.md,
        borderRadius: Shape.radius.xl,
        overflow: 'hidden',
    },
    content: {
        padding: Spacing.lg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    titleSection: {
        marginBottom: Spacing.lg,
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        flex: 1,
        flexWrap: 'wrap',
    },
    amountInfo: {
        flex: 1,
    },
    amountText: {
        fontWeight: 'bold',
    },
});
