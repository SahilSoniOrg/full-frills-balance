import { AppCard } from '@/src/components/core/AppCard';
import { AppText } from '@/src/components/core/AppText';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

interface SimpleFormAmountInputProps {
    amount: string;
    setAmount: (amount: string) => void;
    activeColor: string;
    displayCurrency: string;
    sectionLabelColor: string;
    amountLabel: string;
}

export function SimpleFormAmountInput({
    amount,
    setAmount,
    activeColor,
    displayCurrency,
    sectionLabelColor,
    amountLabel,
}: SimpleFormAmountInputProps) {
    const { theme } = useTheme();

    return (
        <AppCard
            elevation="none"
            variant="default"
            style={[styles.amountCard, { borderColor: withOpacity(activeColor, Opacity.medium), backgroundColor: theme.surface }]}
        >
            <AppText variant="caption" weight="bold" style={[styles.eyebrow, { color: sectionLabelColor }]}>
                {amountLabel}
            </AppText>
            <View style={[styles.amountRow, { backgroundColor: theme.surfaceSecondary }]}>
                <View style={styles.currencyWrap}>
                    <AppText variant="xl" weight="bold" style={{ color: theme.textSecondary, opacity: Opacity.heavy }}>
                        {displayCurrency}
                    </AppText>
                </View>
                <TextInput
                    style={[styles.amountInput, { color: activeColor }]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    autoFocus
                    numberOfLines={1}
                    placeholder="0"
                    placeholderTextColor={withOpacity(theme.textSecondary, Opacity.medium)}
                    cursorColor={activeColor}
                    selectionColor={withOpacity(activeColor, Opacity.muted)}
                    testID="amount-input"
                />
            </View>
        </AppCard>
    );
}

const styles = StyleSheet.create({
    amountCard: {
        borderWidth: 1,
        marginTop: Spacing.xs,
        marginBottom: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
    },
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Shape.radius.r3,
        paddingHorizontal: Spacing.lg,
        minHeight: Size.inputLg,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
        width: '100%',
        overflow: 'hidden',
    },
    currencyWrap: {
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: Size.xl * 2,
    },
    amountInput: {
        flex: 1,
        minWidth: 0,
        maxWidth: '100%',
        flexShrink: 1,
        fontSize: Typography.sizes.xxxl,
        textAlign: 'right',
        writingDirection: 'auto',
        includeFontPadding: false,
    },
    eyebrow: {
        letterSpacing: Typography.letterSpacing.wide * 2,
        marginBottom: Spacing.sm,
    },
});
