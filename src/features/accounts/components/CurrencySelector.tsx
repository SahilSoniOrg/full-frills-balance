import { CurrencyPickerSheet } from '@/src/components/common/CurrencyPickerSheet';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import Currency from '@/src/data/models/Currency';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

interface CurrencySelectorProps {
    selectedCurrency: string;
    currencies: Currency[];
    onSelect: (currencyCode: string) => void;
    disabled?: boolean;
    variant?: 'default' | 'compact' | 'pill';
    title?: string;
    selectedBackgroundColor?: string;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
    selectedCurrency,
    currencies,
    onSelect,
    disabled = false,
    variant = 'default',
    title = AppConfig.strings.accounts.selectCurrency,
    selectedBackgroundColor,
}) => {
    const { theme } = useTheme();
    const [showModal, setShowModal] = useState(false);

    const isCompact = variant === 'compact';
    const isPill = variant === 'pill';
    const selectedCurrencyObj = currencies.find((c) => c.code === selectedCurrency);

    const handleSelect = (code: string) => {
        onSelect(code);
        setShowModal(false);
    };

    return (
        <>
            <TouchableOpacity
                style={[
                    styles.input,
                    {
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                        opacity: disabled ? Opacity.medium : Opacity.solid,
                    },
                    isCompact && styles.compactInput,
                    isPill && styles.pillInput,
                ]}
                onPress={() => !disabled && setShowModal(true)}
                disabled={disabled}
            >
                {(isCompact || isPill) ? (
                    <AppText variant="body" weight="semibold">
                        {selectedCurrency} {selectedCurrencyObj?.symbol}
                    </AppText>
                ) : (
                    <>
                        <AppText variant="body">{selectedCurrencyObj?.name || selectedCurrency}</AppText>
                        <AppText variant="body" color="secondary">
                            {selectedCurrency} {selectedCurrencyObj?.symbol}
                        </AppText>
                    </>
                )}
                {isPill && (
                    <AppIcon
                        name="chevronRight"
                        size={Size.sm}
                        color={theme.text}
                        style={{ marginLeft: Spacing.xs }}
                    />
                )}
            </TouchableOpacity>

            <CurrencyPickerSheet
                visible={showModal}
                title={title}
                currencies={currencies}
                selectedCode={selectedCurrency}
                selectedBackgroundColor={selectedBackgroundColor ?? theme.primaryLight}
                searchPlaceholder={AppConfig.strings.common.searchPlaceholder}
                onClose={() => setShowModal(false)}
                onSelect={handleSelect}
            />
        </>
    );
};

const styles = StyleSheet.create({
    input: {
        borderWidth: 1,
        borderRadius: Shape.radius.r3,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        fontSize: Typography.sizes.base,
        minHeight: Size.inputMd,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    compactInput: {
        minHeight: 48,
        paddingHorizontal: Spacing.sm,
        justifyContent: 'center',
    },
    pillInput: {
        minHeight: 0,
        borderRadius: Shape.radius.full,
        paddingVertical: Spacing.xs + 2,
        paddingHorizontal: Spacing.sm,
    },
});
