import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import PlannedPayment, { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export interface PlannedPaymentCardProps {
    item: PlannedPayment;
    onPress: () => void;
}

export function PlannedPaymentCard({ item, onPress }: PlannedPaymentCardProps) {
    const { theme } = useTheme();

    const getIntervalLabel = () => {
        const n = item.intervalN;
        const type = item.intervalType.toLowerCase();
        if (n === 1) {
            switch (item.intervalType) {
                case PlannedPaymentInterval.DAILY: return AppConfig.strings.plannedPayments.everyDay;
                case PlannedPaymentInterval.WEEKLY: return AppConfig.strings.plannedPayments.everyWeek;
                case PlannedPaymentInterval.MONTHLY: return AppConfig.strings.plannedPayments.everyMonth;
                case PlannedPaymentInterval.YEARLY: return AppConfig.strings.plannedPayments.everyYear;
            }
        }
        return AppConfig.strings.plannedPayments.everyN(n, type);
    };

    return (
        <TouchableOpacity
            style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={styles.header}>
                <View style={styles.titleContainer}>
                    <AppText variant="body" weight="semibold">{item.name}</AppText>
                    <AppText variant="caption" color="secondary">{getIntervalLabel()}</AppText>
                </View>
                <AppText variant="body" weight="bold" style={{ color: item.amount < 0 ? theme.error : theme.success }}>
                    {CurrencyFormatter.format(item.amount, item.currencyCode)}
                </AppText>
            </View>

            <View style={styles.footer}>
                <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={14} color={theme.textSecondary} />
                    <AppText variant="caption" color="secondary" style={styles.infoText}>
                        {AppConfig.strings.plannedPayments.nextOccurrence(new Date(item.nextOccurrence).toLocaleDateString())}
                    </AppText>
                </View>

                {item.status === PlannedPaymentStatus.PAUSED && (
                    <View style={[styles.badge, { backgroundColor: theme.surfaceSecondary }]}>
                        <AppText variant="caption" color="secondary">{AppConfig.strings.plannedPayments.statusPaused}</AppText>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: Spacing.md,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.sm,
    },
    titleContainer: {
        flex: 1,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    infoText: {
        marginLeft: Spacing.xs,
    },
    badge: {
        paddingHorizontal: Spacing.xs,
        paddingVertical: 2,
        borderRadius: 4,
    },
});
