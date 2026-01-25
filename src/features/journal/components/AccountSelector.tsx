import { AppText } from '@/components/core';
import { Shape, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import React from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';

interface AccountSelectorProps {
    visible: boolean;
    accounts: any[]; // Replace with proper Account type when available
    onClose: () => void;
    onSelect: (accountId: string) => void;
}

export function AccountSelector({
    visible,
    accounts,
    onClose,
    onSelect,
}: AccountSelectorProps) {
    const { theme } = useTheme();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
                    <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                        <AppText variant="heading">Select Account</AppText>
                        <TouchableOpacity onPress={onClose}>
                            <AppText variant="body" color="secondary">✕</AppText>
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={accounts}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.accountItem, {
                                    backgroundColor: theme.surface,
                                    borderColor: theme.border
                                }]}
                                onPress={() => onSelect(item.id)}
                            >
                                <View>
                                    <AppText variant="body">{item.name}</AppText>
                                    <AppText variant="caption" color="secondary">
                                        {item.accountType} • {item.currencyCode}
                                    </AppText>
                                </View>
                            </TouchableOpacity>
                        )}
                        contentContainerStyle={styles.accountsListContent}
                        style={styles.accountsList}
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
        borderTopLeftRadius: Shape.radius.r2, // More pronounced Ivy-style rounding
        borderTopRightRadius: Shape.radius.r2,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
    },
    accountItem: {
        padding: Spacing.md,
        borderWidth: 1,
        borderRadius: Shape.radius.r3,
        marginBottom: Spacing.sm,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    accountsList: {
        flex: 1,
    },
    accountsListContent: {
        padding: Spacing.md,
    },
});
