import { CurrencyPickerSheet } from '@/src/components/common/CurrencyPickerSheet';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export const CurrencyPreference = () => {
    const { theme } = useTheme();
    const { defaultCurrency, updateUserDetails } = useUI();
    const { currencies } = useCurrencies();
    const [showModal, setShowModal] = useState(false);

    const selectedCurrencyObj = currencies.find((c) => c.code === defaultCurrency);

    const handleSelect = async (code: string) => {
        await updateUserDetails('', code);
        setShowModal(false);
    };

    return (
        <>
            <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                    <AppText variant="body" weight="semibold">{AppConfig.strings.settings.currency.title}</AppText>
                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.currency.description}</AppText>
                </View>
                <TouchableOpacity
                    onPress={() => setShowModal(true)}
                    style={[styles.selector, { borderColor: theme.border, backgroundColor: theme.background }]}
                >
                    <AppText variant="body" weight="semibold" style={{ marginRight: Spacing.xs }}>
                        {defaultCurrency}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                        {selectedCurrencyObj?.symbol}
                    </AppText>
                    <AppIcon name="chevronRight" size={Size.sm} color={theme.text} style={{ marginLeft: Spacing.xs }} />
                </TouchableOpacity>
            </View>

            <CurrencyPickerSheet
                visible={showModal}
                title={AppConfig.strings.settings.currency.selectTitle}
                currencies={currencies}
                selectedCode={defaultCurrency}
                searchPlaceholder={AppConfig.strings.common.searchPlaceholder}
                selectedBackgroundColor={withOpacity(theme.primary, Opacity.soft / 2)}
                onClose={() => setShowModal(false)}
                onSelect={handleSelect}
            />
        </>
    );
};

const styles = StyleSheet.create({
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.xs,
    },
    selector: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs + 2,
        borderRadius: Shape.radius.r2,
        borderWidth: 1,
    },
});
