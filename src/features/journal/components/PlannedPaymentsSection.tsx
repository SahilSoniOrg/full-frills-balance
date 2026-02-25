import { AppConfig, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { EnrichedJournal } from '@/src/types/domain';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { JournalCard } from './JournalCard';

export interface PlannedPaymentsSectionProps {
    items: EnrichedJournal[];
    onItemPress?: (item: EnrichedJournal) => void;
}

export function PlannedPaymentsSection({ items, onItemPress }: PlannedPaymentsSectionProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const { theme } = useTheme();

    if (items.length === 0) return null;

    return (
        <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity
                style={[styles.header, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() => setIsExpanded(!isExpanded)}
                activeOpacity={0.7}
            >
                <Text style={[styles.title, { color: theme.textSecondary }]}>
                    {AppConfig.strings.journal.plannedPayments || 'Planned Payments'} ({items.length})
                </Text>
                <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={theme.textSecondary}
                />
            </TouchableOpacity>

            {isExpanded && (
                <View style={styles.list}>
                    {items.map((item) => (
                        <JournalCard
                            key={item.id}
                            journal={item}
                            onPress={() => onItemPress?.(item)}
                        />
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.md,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.md,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    list: {
        paddingTop: Spacing.xs,
    },
});
