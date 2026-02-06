import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { COMMON_CURRENCY_CODES } from '@/src/services/currency-init-service';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface StepCurrencyProps {
    selectedCurrency: string;
    onSelect: (code: string) => void;
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
}

export const StepCurrency: React.FC<StepCurrencyProps> = ({
    selectedCurrency,
    onSelect,
    onContinue,
    onBack,
    isCompleting,
}) => {
    const { currencies } = useCurrencies();
    const { theme } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCurrencies = useMemo(() => {
        if (!searchQuery.trim()) {
            // Show only first bunch of common ones for clean initial view
            return currencies.filter(c => COMMON_CURRENCY_CODES.slice(0, 12).includes(c.code));
        }
        return currencies.filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.code.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 50);
    }, [currencies, searchQuery]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            <AppText variant="title" style={styles.title}>
                Default Currency
            </AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
                Choose the default currency for your accounts and transactions.
            </AppText>

            <AppInput
                placeholder="Search currency..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                containerStyle={styles.searchBar}
                accessibilityLabel="Search currencies"
            />

            <ScrollView
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.grid}>
                    {filteredCurrencies.map((currency) => {
                        const isSelected = selectedCurrency === currency.code;
                        return (
                            <TouchableOpacity
                                key={currency.code}
                                style={[
                                    styles.suggestionItem,
                                    {
                                        backgroundColor: isSelected ? theme.primary + '20' : theme.surface,
                                        borderColor: isSelected ? theme.primary : theme.border,
                                    }
                                ]}
                                onPress={() => onSelect(currency.code)}
                                accessibilityLabel={`${currency.name} (${currency.code}), ${isSelected ? 'selected' : 'not selected'}`}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSelected }}
                            >
                                <AppText
                                    variant="subheading"
                                    style={[
                                        styles.symbolText,
                                        { color: isSelected ? theme.primary : theme.text }
                                    ]}
                                >
                                    {currency.symbol}
                                </AppText>
                                <AppText
                                    variant="caption"
                                    numberOfLines={1}
                                    style={[
                                        styles.itemText,
                                        { color: isSelected ? theme.primary : theme.text }
                                    ]}
                                >
                                    {currency.code}
                                </AppText>
                                {isSelected && (
                                    <View style={[styles.checkBadge, { backgroundColor: theme.success }]}>
                                        <AppIcon name="checkCircle" size={12} color={theme.surface} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            <View style={styles.buttonContainer}>
                <AppButton
                    variant="outline"
                    size="md"
                    onPress={onContinue}
                    disabled={isCompleting}
                    style={styles.continueButton}
                >
                    Continue
                </AppButton>
                <AppButton
                    variant="ghost"
                    size="md"
                    onPress={onBack}
                    disabled={isCompleting}
                >
                    Back
                </AppButton>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        flex: 1,
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    searchBar: {
        marginBottom: Spacing.md,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: Spacing.xl,
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
        justifyContent: 'flex-start',
        overflow: 'visible',
    },
    suggestionItem: {
        width: '30%',
        aspectRatio: 1,
        borderRadius: Shape.radius.r3,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.sm,
        position: 'relative',
        marginBottom: Spacing.xs,
        overflow: 'visible',
    },
    symbolText: {
        fontSize: 20,
        marginBottom: 2,
    },
    itemText: {
        textAlign: 'center',
        fontSize: 10,
    },
    checkBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        borderRadius: 10,
        padding: 2,
    },
    buttonContainer: {
        gap: Spacing.md,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.xl,
    },
    continueButton: {
        marginBottom: Spacing.xs,
    },
});
