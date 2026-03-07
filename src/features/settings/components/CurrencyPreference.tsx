import { AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { CurrencySelector } from '@/src/features/accounts';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export const CurrencyPreference = () => {
    const { theme } = useTheme();
    const { defaultCurrency, updateUserDetails } = useUI();
    const { currencies } = useCurrencies();

    const handleSelect = async (code: string) => {
        await updateUserDetails('', code);
    };

    return (
        <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
                <AppText variant="body" weight="semibold">{AppConfig.strings.settings.currency.title}</AppText>
                <AppText variant="caption" color="secondary">{AppConfig.strings.settings.currency.description}</AppText>
            </View>
            <CurrencySelector
                selectedCurrency={defaultCurrency}
                currencies={currencies}
                onSelect={handleSelect}
                variant="pill"
                title={AppConfig.strings.settings.currency.selectTitle}
                selectedBackgroundColor={withOpacity(theme.primary, Opacity.soft / 2)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.xs,
    },
});
