import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import Currency from '@/src/data/models/Currency';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';

interface CurrencyPickerSheetProps {
    visible: boolean;
    title: string;
    currencies: Currency[];
    selectedCode: string;
    searchPlaceholder?: string;
    selectedBackgroundColor?: string;
    onClose: () => void;
    onSelect: (code: string) => void;
}

export function CurrencyPickerSheet({
    visible,
    title,
    currencies,
    selectedCode,
    searchPlaceholder = 'Search...',
    selectedBackgroundColor,
    onClose,
    onSelect,
}: CurrencyPickerSheetProps) {
    const { theme } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCurrencies = useMemo(() => {
        if (!searchQuery) return currencies;
        const query = searchQuery.toLowerCase();
        return currencies.filter((c) =>
            c.code.toLowerCase().includes(query) ||
            c.name.toLowerCase().includes(query) ||
            c.symbol.toLowerCase().includes(query),
        );
    }, [currencies, searchQuery]);

    const closeAndReset = () => {
        setSearchQuery('');
        onClose();
    };

    const handleSelect = (code: string) => {
        onSelect(code);
        closeAndReset();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={closeAndReset}
        >
            <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                    <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                        <AppText variant="heading">{title}</AppText>
                        <TouchableOpacity onPress={closeAndReset} accessibilityLabel="Close" accessibilityRole="button">
                            <AppIcon name="close" size={Size.iconMd} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.searchContainer}>
                        <AppInput
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            leftIcon="search"
                            containerStyle={{ marginBottom: Spacing.sm }}
                        />
                    </View>

                    <FlatList
                        data={filteredCurrencies}
                        keyExtractor={(item) => item.code}
                        renderItem={({ item }) => {
                            const isSelected = selectedCode === item.code;
                            return (
                                <TouchableOpacity
                                    style={[
                                        styles.currencyItem,
                                        { borderBottomColor: theme.border },
                                        isSelected && { backgroundColor: selectedBackgroundColor ?? withOpacity(theme.primary, Opacity.selection) },
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
                                        {isSelected && (
                                            <AppIcon name="checkCircle" size={Size.iconSm} color={theme.primary} style={{ marginLeft: Spacing.sm }} />
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
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
