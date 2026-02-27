import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { EnrichedJournal } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { mapJournalToCardProps } from '../utils/journalUiUtils';

export interface PlannedPaymentsSectionProps {
    items: EnrichedJournal[];
    onItemPress?: (item: EnrichedJournal) => void;
}

export function PlannedPaymentsSection({ items, onItemPress }: PlannedPaymentsSectionProps) {
    const { theme } = useTheme();

    if (items.length === 0) return null;

    return (
        <View style={styles.container}>
            <AppText variant="subheading" color="secondary" style={styles.title}>
                {AppConfig.strings.journal.upcoming}
            </AppText>

            <View style={styles.list}>
                {items.map((item) => {
                    const mapped = mapJournalToCardProps(item);

                    const dateObj = new Date(mapped.transactionDate);
                    const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const amountStr = CurrencyFormatter.format(mapped.amount, mapped.currencyCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                    const typeColor = theme[mapped.presentation.typeColor as keyof typeof theme] as string | undefined;

                    return (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.row}
                            onPress={() => onItemPress?.(item)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.left}>
                                <AppText variant="body" color="secondary">
                                    {dateStr} — {mapped.title}
                                </AppText>
                            </View>
                            <AppText variant="body" weight="medium" style={{ color: typeColor || theme.text }}>
                                {mapped.presentation.amountPrefix || ''}{amountStr}
                            </AppText>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.xl,
    },
    title: {
        marginBottom: Spacing.sm,
    },
    list: {
        gap: Spacing.sm,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    left: {
        flex: 1,
        marginRight: Spacing.sm,
    },
});
