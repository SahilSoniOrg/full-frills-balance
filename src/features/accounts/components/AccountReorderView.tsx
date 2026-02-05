import { AppCard, AppIcon, AppText, Stack } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { AccountReorderViewModel } from '@/src/features/accounts/hooks/useAccountReorderViewModel';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export function AccountReorderView({
    theme,
    accounts,
    isLoading,
    onMove,
    onBack,
}: AccountReorderViewModel) {
    if (isLoading) return null;

    return (
        <Screen showBack={false}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}
            >
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <AppIcon name="close" size={24} color={theme.text} />
                </TouchableOpacity>
                <AppText variant="subheading" weight="bold">Reorder Accounts</AppText>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <AppText variant="caption" color="secondary" style={styles.tipText}>
                    Manual ordering affects all lists. Accounts are grouped by category but follow this sequence.
                </AppText>

                <Stack space="sm">
                    {accounts.map((account, index) => (
                        <AppCard key={account.id} padding="none" style={styles.itemCard}>
                            <View style={styles.itemContent}>
                                <View style={styles.dragHandle}>
                                    <AppIcon name="menu" size={20} color={theme.textSecondary} />
                                </View>

                                <View style={styles.accountInfo}>
                                    <AppText variant="body" weight="semibold" numberOfLines={1}>
                                        {account.name}
                                    </AppText>
                                    <AppText variant="caption" color="secondary">
                                        {account.accountType} • {account.currencyCode}
                                    </AppText>
                                </View>

                                <View style={styles.actions}>
                                    <TouchableOpacity
                                        onPress={() => onMove(index, 'up')}
                                        disabled={index === 0}
                                        style={[
                                            styles.actionButton,
                                            { backgroundColor: withOpacity(theme.text, Opacity.soft) },
                                            index === 0 && { opacity: 0.3 }
                                        ]}
                                    >
                                        <AppIcon name="chevronUp" size={20} color={theme.text} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => onMove(index, 'down')}
                                        disabled={index === accounts.length - 1}
                                        style={[
                                            styles.actionButton,
                                            { backgroundColor: withOpacity(theme.text, Opacity.soft) },
                                            index === accounts.length - 1 && { opacity: 0.3 }
                                        ]}
                                    >
                                        <AppIcon name="chevronDown" size={20} color={theme.text} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </AppCard>
                    ))}
                </Stack>
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: Spacing.xs,
    },
    scrollContent: {
        padding: Spacing.lg,
    },
    tipText: {
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },
    itemCard: {
        borderRadius: Shape.radius.md,
    },
    itemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
    },
    dragHandle: {
        marginRight: Spacing.md,
    },
    accountInfo: {
        flex: 1,
    },
    actions: {
        flexDirection: 'row',
        gap: Spacing.xs,
    },
    actionButton: {
        padding: Spacing.xs,
        borderRadius: Shape.radius.sm,
    }
});
