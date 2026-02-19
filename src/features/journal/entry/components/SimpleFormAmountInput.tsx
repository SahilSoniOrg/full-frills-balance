import { AppText } from '@/src/components/core/AppText';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

interface SimpleFormAmountInputProps {
    amount: string;
    setAmount?: (amount: string) => void;
    activeColor: string;
    displayCurrency: string;
    sectionLabelColor?: string;
    readOnly?: boolean;
}

export function SimpleFormAmountInput({
    amount,
    setAmount,
    activeColor,
    displayCurrency,
    readOnly,
}: SimpleFormAmountInputProps) {
    const { theme, fonts } = useTheme();

    return (
        <View style={[styles.amountRow, { backgroundColor: theme.surfaceSecondary }]}>
            <View style={styles.currencyWrap}>
                <AppText variant="xl" weight="bold" style={{ color: theme.textSecondary, opacity: Opacity.heavy }}>
                    {displayCurrency}
                </AppText>
            </View>
            {readOnly ? (
                <View style={styles.amountDisplay}>
                    <AppText
                        variant="title"
                        weight="bold"
                        style={{ color: activeColor, textAlign: 'right' }}
                        numberOfLines={1}
                    >
                        {amount || '0'}
                    </AppText>
                </View>
            ) : (
                <TextInput
                    style={[styles.amountInput, { color: activeColor, fontFamily: fonts.heading }]}
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
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    amountCard: {
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
    amountDisplay: {
        flex: 1,
        justifyContent: 'center',
    },
});
