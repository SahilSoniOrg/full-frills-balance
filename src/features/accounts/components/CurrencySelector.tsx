import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';

interface CurrencySelectorProps {
    selectedCurrency: string;
    onSelect: (currencyCode: string) => void;
    disabled?: boolean;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
    selectedCurrency,
    onSelect,
    disabled = false,
}) => {
    const { theme } = useTheme();
    const { currencies } = useCurrencies();
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const selectedCurrencyObj = currencies.find((c) => c.code === selectedCurrency);

    const filteredCurrencies = useMemo(() => {
        if (!searchQuery) return currencies;
        const query = searchQuery.toLowerCase();
        return currencies.filter(c =>
            c.code.toLowerCase().includes(query) ||
            c.name.toLowerCase().includes(query) ||
            c.symbol.toLowerCase().includes(query)
        );
    }, [currencies, searchQuery]);

    const handleSelect = (code: string) => {
        onSelect(code);
        setShowModal(false);
        setSearchQuery('');
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
                ]}
                onPress={() => !disabled && setShowModal(true)}
                disabled={disabled}
            >
                <AppText variant="body">
                    {selectedCurrencyObj?.name || selectedCurrency}
                </AppText>
                <AppText variant="body" color="secondary">
                    {selectedCurrency} {selectedCurrencyObj?.symbol}
                </AppText>
            </TouchableOpacity>

            <Modal
                visible={showModal}
                animationType="slide"
                transparent
                onRequestClose={() => setShowModal(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                            <AppText variant="heading">{AppConfig.strings.accounts.selectCurrency}</AppText>
                            <TouchableOpacity onPress={() => setShowModal(false)}>
                                <AppIcon name="close" size={Size.iconMd} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchContainer}>
                            <AppInput
                                placeholder={AppConfig.strings.common.searchPlaceholder}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                leftIcon="search"
                                containerStyle={{ marginBottom: Spacing.sm }}
                            />
                        </View>

                        <FlatList
                            data={filteredCurrencies}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.currencyItem,
                                        { borderBottomColor: theme.border },
                                        selectedCurrency === item.code && { backgroundColor: theme.primaryLight },
                                    ]}
                                    onPress={() => handleSelect(item.code)}
                                >
                                    <View>
                                        <AppText variant="body">{item.name}</AppText>
                                        <AppText variant="caption" color="secondary">
                                            {item.code}
                                        </AppText>
                                    </View>
                                    <AppText variant="subheading">{item.symbol}</AppText>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
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
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        height: AppConfig.layout.modalHeightPercent,
        borderTopLeftRadius: Shape.radius.r1,
        borderTopRightRadius: Shape.radius.r1,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
    },
    searchContainer: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
    },
    currencyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
    },
});
