import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';

export const CurrencyPreference = () => {
    const { theme } = useTheme();
    const { defaultCurrency, updateUserDetails } = useUI();
    const { currencies } = useCurrencies();
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const selectedCurrencyObj = currencies.find((c) => c.code === defaultCurrency);

    const filteredCurrencies = useMemo(() => {
        if (!searchQuery) return currencies;
        const query = searchQuery.toLowerCase();
        return currencies.filter(c =>
            c.code.toLowerCase().includes(query) ||
            c.name.toLowerCase().includes(query) ||
            c.symbol.toLowerCase().includes(query)
        );
    }, [currencies, searchQuery]);

    const handleSelect = async (code: string) => {
        await updateUserDetails('', code);
        setShowModal(false);
        setSearchQuery('');
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

            <Modal
                visible={showModal}
                animationType="slide"
                transparent
                onRequestClose={() => setShowModal(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                            <AppText variant="heading">{AppConfig.strings.settings.currency.selectTitle}</AppText>
                            <TouchableOpacity onPress={() => setShowModal(false)} accessibilityLabel={AppConfig.strings.common.cancel} accessibilityRole="button">
                                <AppIcon name="close" size={Typography.sizes.xxl} color={theme.text} />
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
                                        defaultCurrency === item.code && { backgroundColor: withOpacity(theme.primary, Opacity.soft / 2) },
                                    ]}
                                    onPress={() => handleSelect(item.code)}
                                    accessibilityLabel={`${item.name} (${item.code})`}
                                    accessibilityRole="button"
                                >
                                    <View>
                                        <AppText variant="body">{item.name}</AppText>
                                        <AppText variant="caption" color="secondary">
                                            {item.code}
                                        </AppText>
                                    </View>
                                    <View style={styles.currencyRight}>
                                        <AppText variant="subheading">{item.symbol}</AppText>
                                        {defaultCurrency === item.code && (
                                            <AppIcon name="checkCircle" size={Size.sm} color={theme.primary} style={{ marginLeft: Spacing.sm }} />
                                        )}
                                    </View>
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
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        height: AppConfig.layout.modalHeightPercent,
        borderTopLeftRadius: Shape.radius.r3,
        borderTopRightRadius: Shape.radius.r3,
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
    currencyRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
