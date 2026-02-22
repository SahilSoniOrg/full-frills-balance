import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface HierarchyMoveModalProps {
    selectedAccountId: string | null;
    selectedAccount: Account | undefined;
    canSelectedAccountBeParent: boolean;
    addChildCandidates: Account[];
    parentCandidates: Account[];
    balancesByAccountId: Map<string, { transactionCount?: number; directTransactionCount?: number }>;
    onSelectAccount: (accountId: string | null) => void;
    onAddChild: (parentId: string, childId: string) => Promise<void>;
    onAssignParent: (accountId: string, parentId: string | null) => Promise<void>;
}

export function HierarchyMoveModal({
    selectedAccountId,
    selectedAccount,
    canSelectedAccountBeParent,
    addChildCandidates,
    parentCandidates,
    balancesByAccountId,
    onSelectAccount,
    onAddChild,
    onAssignParent,
}: HierarchyMoveModalProps) {
    const { theme } = useTheme();

    return (
        <Modal
            visible={!!selectedAccountId}
            transparent
            animationType="fade"
            onRequestClose={() => onSelectAccount(null)}
        >
            <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={() => onSelectAccount(null)}>
                <View style={[styles.modalContent, { backgroundColor: theme.surface }]}> 
                    <View style={styles.modalHeader}>
                        <AppText variant="subheading" weight="bold">
                            {AppConfig.strings.accounts.hierarchy.modalTitle}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                            {AppConfig.strings.accounts.hierarchy.modalDescription(selectedAccount?.name || '')}
                        </AppText>
                    </View>

                    <ScrollView style={styles.modalScroll}>
                        {canSelectedAccountBeParent && (
                            <View style={styles.destinationSection}>
                                <AppText variant="caption" weight="bold" style={styles.sectionLabel}>
                                    {AppConfig.strings.accounts.hierarchy.addChildrenLabel}
                                </AppText>
                                {addChildCandidates.map((candidate) => (
                                    <TouchableOpacity
                                        key={candidate.id}
                                        style={[styles.destinationItem, { borderBottomColor: theme.divider }]}
                                        onPress={() => selectedAccountId && void onAddChild(selectedAccountId, candidate.id)}
                                    >
                                        <AppIcon
                                            name={candidate.icon}
                                            fallbackIcon="wallet"
                                            size={Size.iconSm}
                                            color={theme.textSecondary}
                                        />
                                        <View style={{ flex: 1 }}>
                                            <AppText variant="body">{candidate.name}</AppText>
                                            {(balancesByAccountId.get(candidate.id)?.transactionCount || 0) > 0 && (
                                                <AppText variant="caption" color="secondary">
                                                    {AppConfig.strings.accounts.hierarchy.hasTransactions}
                                                </AppText>
                                            )}
                                        </View>
                                        <AppIcon name="add" size={Size.iconXs} color={theme.success} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        <View style={styles.destinationSection}>
                            <AppText variant="caption" weight="bold" style={styles.sectionLabel}>
                                {AppConfig.strings.accounts.hierarchy.moveParentLabel}
                            </AppText>
                            {parentCandidates.map((candidate) => (
                                <TouchableOpacity
                                    key={candidate.id}
                                    style={[styles.destinationItem, { borderBottomColor: theme.divider }]}
                                    onPress={() => selectedAccountId && void onAssignParent(selectedAccountId, candidate.id)}
                                >
                                    <AppIcon
                                        name={candidate.icon}
                                        fallbackIcon="wallet"
                                        size={Size.iconSm}
                                        color={theme.textSecondary}
                                    />
                                    <AppText variant="body" style={{ flex: 1 }}>
                                        {candidate.name}
                                    </AppText>
                                    {selectedAccount?.parentAccountId === candidate.id && (
                                        <AppIcon name="check" size={Size.iconSm} color={theme.success} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>

                    <AppButton onPress={() => onSelectAccount(null)} variant="ghost" style={styles.cancelButton}>
                        {AppConfig.strings.common.cancel}
                    </AppButton>
                </View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: Shape.radius.r2,
        borderTopRightRadius: Shape.radius.r2,
        padding: Spacing.lg,
        maxHeight: AppConfig.layout.hierarchyModalHeightPercent,
    },
    modalHeader: {
        marginBottom: Spacing.lg,
    },
    modalScroll: {
        marginBottom: Spacing.md,
    },
    destinationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.lg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: Spacing.md,
    },
    destinationSection: {
        marginTop: Spacing.lg,
    },
    sectionLabel: {
        letterSpacing: Typography.letterSpacing.wide * 2,
        marginBottom: Spacing.sm,
    },
    cancelButton: {
        marginTop: Spacing.sm,
    },
});
