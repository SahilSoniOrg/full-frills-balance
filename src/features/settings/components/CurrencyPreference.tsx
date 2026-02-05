import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';

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
                    <AppText variant="body" weight="semibold">Default Currency</AppText>
                    <AppText variant="caption" color="secondary">Used for new accounts and total balance</AppText>
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
                            <AppText variant="heading">Select Default Currency</AppText>
                            <TouchableOpacity onPress={() => setShowModal(false)}>
                                <AppIcon name="close" size={Typography.sizes.xxl} color={theme.text} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={currencies}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.currencyItem,
                                        { borderBottomColor: theme.border },
                                        defaultCurrency === item.code && { backgroundColor: withOpacity(theme.primary, Opacity.soft / 2) },
                                    ]}
                                    onPress={() => handleSelect(item.code)}
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
        height: '70%',
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
