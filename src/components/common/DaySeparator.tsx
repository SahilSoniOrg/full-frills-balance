import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDaySeparator } from '@/src/utils/dateUtils';
import { formatCurrency } from '@/src/utils/money';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface DaySeparatorProps {
    date: number;
    isCollapsed?: boolean;
    onToggle?: () => void;
    count?: number;
    netAmount?: number;
    currencyCode?: string;
}

export function DaySeparator({ date, isCollapsed, onToggle, count, netAmount, currencyCode }: DaySeparatorProps) {
    const { theme } = useTheme();
    const label = formatDaySeparator(date);

    const hasStats = count !== undefined && netAmount !== undefined;
    const isPositive = (netAmount || 0) > 0;
    const isNegative = (netAmount || 0) < 0;

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={onToggle}
            style={[styles.container, { backgroundColor: theme.background }]}
        >
            <View style={styles.content}>
                <View style={styles.leftContent}>
                    <AppText
                        variant="caption"
                        color="secondary"
                        style={[styles.text, { fontFamily: Typography.fonts.semibold }]}
                    >
                        {label.toUpperCase()}
                    </AppText>
                    {hasStats && (
                        <AppText variant="caption" color="secondary" style={styles.statCount}>
                            {AppConfig.strings.journal.transactionCount(count)}
                        </AppText>
                    )}
                </View>

                <View style={styles.rightContent}>
                    {hasStats && netAmount !== undefined && netAmount !== 0 && (
                        <AppText
                            variant="caption"
                            style={[
                                styles.netAmount,
                                { color: isPositive ? theme.success : isNegative ? theme.error : theme.textSecondary }
                            ]}
                        >
                            {isPositive ? '+' : ''}
                            {formatCurrency(netAmount, currencyCode)}
                        </AppText>
                    )}
                    <AppIcon
                        name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                        size={16}
                        color={theme.textSecondary}
                    />
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.sm,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    leftContent: {
        flex: 1,
    },
    rightContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    text: {
        letterSpacing: Typography.letterSpacing.wide,
    },
    statCount: {
        fontSize: Typography.sizes.xs,
        opacity: 0.7,
        marginTop: 2,
    },
    netAmount: {
        fontFamily: Typography.fonts.semibold,
        fontSize: Typography.sizes.xs,
    },
});
