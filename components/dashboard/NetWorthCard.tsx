import { AppCard, AppText } from '@/components/core';
import { Spacing } from '@/constants';
import { useUI } from '@/contexts/UIContext';
import { useTheme } from '@/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface NetWorthCardProps {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    isLoading?: boolean;
    hidden?: boolean;
    onToggleHidden?: (hidden: boolean) => void;
}

export const NetWorthCard = ({
    netWorth,
    totalAssets,
    totalLiabilities,
    isLoading = false,
    hidden: controlledHidden,
    onToggleHidden
}: NetWorthCardProps) => {
    const { theme } = useTheme();
    const { isPrivacyMode } = useUI();
    const [internalHidden, setInternalHidden] = useState(isPrivacyMode);

    // Sync with global privacy mode when it changes (e.g. from settings)
    useEffect(() => {
        setInternalHidden(isPrivacyMode);
    }, [isPrivacyMode]);

    const isActuallyHidden = controlledHidden !== undefined ? controlledHidden : internalHidden;

    const handleToggle = () => {
        if (onToggleHidden) {
            onToggleHidden(!isActuallyHidden);
        } else {
            setInternalHidden(!internalHidden);
        }
    };

    const formatCurrency = (amount: number) => {
        if (isLoading) return '...';
        if (isActuallyHidden) return '••••••';
        return CurrencyFormatter.format(amount, undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    };

    return (
        <AppCard
            elevation="md"
            padding="lg"
            radius="r1"
            style={[styles.container, { backgroundColor: theme.surface }]} // Maybe use primary color bg?
        >
            <View style={styles.header}>
                <AppText variant="subheading" color="secondary">
                    Net Worth
                </AppText>
                <TouchableOpacity onPress={handleToggle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons
                        name={isActuallyHidden ? "eye-off" : "eye"}
                        size={20}
                        color={theme.textTertiary}
                    />
                </TouchableOpacity>
            </View>

            <AppText variant="title" style={styles.netWorthAmount}>
                {formatCurrency(netWorth)}
            </AppText>

            <View style={styles.breakdownContainer}>
                <View style={styles.breakdownItem}>
                    <View style={[styles.dot, { backgroundColor: theme.asset }]} />
                    <View>
                        <AppText variant="caption" color="secondary">Assets</AppText>
                        <AppText variant="heading" color="asset">
                            {formatCurrency(totalAssets)}
                        </AppText>
                    </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.breakdownItem}>
                    <View style={[styles.dot, { backgroundColor: theme.liability }]} />
                    <View>
                        <AppText variant="caption" color="secondary">Liabilities</AppText>
                        <AppText variant="heading" color="liability">
                            {formatCurrency(totalLiabilities)}
                        </AppText>
                    </View>
                </View>
            </View>
        </AppCard>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.lg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    netWorthAmount: {
        fontSize: 36, // Larger than standard title
        marginBottom: Spacing.xl,
    },
    breakdownContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start', // specific alignment
    },
    breakdownItem: {
        flex: 1,
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 6, // Optical alignment with text
    },
    divider: {
        width: 1,
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.05)',
        marginHorizontal: Spacing.md,
    }
});
