import { AppIcon, AppText, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Shape, Size, Spacing } from '@/src/constants';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { AccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import { AccountCardViewModel, AccountSectionViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

export function AccountsListView({
    sections,
    isRefreshing,
    onRefresh,
    onToggleSection,
    onAccountPress,
    onCreateAccount,
    onReorderPress,
    onTogglePrivacy,
    isPrivacyMode,
}: AccountsListViewModel) {
    const { theme } = useTheme();
    return (
        <Screen showBack={false}>
            <View style={styles.container}>
                <SectionList
                    sections={sections}
                    refreshing={isRefreshing}
                    onRefresh={onRefresh}
                    keyExtractor={(item: AccountCardViewModel) => item.id}
                    renderSectionHeader={({ section }: { section: AccountSectionViewModel }) => (
                        <TouchableOpacity
                            onPress={() => onToggleSection(section.title)}
                            activeOpacity={0.7}
                            style={styles.sectionHeaderContainer}
                            accessibilityLabel={`${section.title} section, ${section.count} accounts`}
                            accessibilityRole="button"
                        >
                            <View style={[styles.summaryRow, { flex: 1 }]}>
                                <View style={styles.flexRowGapSm}>
                                    <AppText
                                        variant="subheading"
                                        weight="bold"
                                        color="secondary"
                                    >
                                        {section.title}
                                    </AppText>
                                    <View style={[styles.countBadge, { backgroundColor: theme.surfaceSecondary }]}>
                                        <AppText variant="caption" weight="bold" color="tertiary">
                                            {section.count}
                                        </AppText>
                                    </View>
                                </View>
                                <View style={styles.flexRowGapMd}>
                                    <AppText variant="body" weight="bold" style={{ color: section.totalColor }}>
                                        {section.totalDisplay}
                                    </AppText>
                                    <AppIcon
                                        name={section.isCollapsed ? "chevronRight" : "chevronDown"}
                                        size={Size.iconSm}
                                        color={theme.textSecondary}
                                    />
                                </View>
                            </View>
                        </TouchableOpacity>
                    )}
                    renderItem={({ item, section }: { item: AccountCardViewModel; section: AccountSectionViewModel }) => {
                        if (section.isCollapsed) return null;
                        return (
                            <AccountCard
                                account={item}
                                onPress={() => onAccountPress(item.id)}
                                dividerColor={theme.divider}
                                surfaceColor={theme.surface}
                            />
                        );
                    }}
                    ListHeaderComponent={
                        <View style={styles.header}>
                            <View style={[styles.summaryRow, styles.screenHeaderTop]}>
                                <AppText variant="title" weight="bold">Accounts</AppText>
                                <View style={styles.flexRowGapSm}>
                                    <TouchableOpacity
                                        onPress={onTogglePrivacy}
                                        style={[styles.reorderIconButton, { backgroundColor: theme.surfaceSecondary }]}
                                        accessibilityLabel={isPrivacyMode ? "Show balances" : "Hide balances"}
                                        accessibilityRole="button"
                                    >
                                        <AppIcon
                                            name={isPrivacyMode ? "eyeOff" : "eye"}
                                            size={Size.iconSm}
                                            color={theme.text}
                                        />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={onReorderPress}
                                        style={[styles.reorderIconButton, { backgroundColor: theme.surfaceSecondary }]}
                                        accessibilityLabel="Reorder accounts"
                                        accessibilityRole="button"
                                    >
                                        <AppIcon name="reorder" size={Size.iconSm} color={theme.text} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <AppText variant="body" color="secondary">
                                No accounts yet. Create your first account to get started!
                            </AppText>
                        </View>
                    }
                    contentContainerStyle={styles.listContainer}
                    stickySectionHeadersEnabled={false}
                />

                <FloatingActionButton onPress={onCreateAccount} />
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContainer: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Size.fab + Spacing.xxxl,
    },
    header: {
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.lg,
    },
    screenHeaderTop: {
        marginBottom: Spacing.xl,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    flexRowGapSm: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    flexRowGapMd: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    reorderIconButton: {
        width: Size.xl,
        height: Size.xl,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionHeaderContainer: {
        marginTop: Spacing.xl,
        marginBottom: Spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
    },
    countBadge: {
        paddingHorizontal: Spacing.xs,
        paddingVertical: Spacing.xs / 2,
        borderRadius: Shape.radius.sm,
        minWidth: Size.iconSm,
        alignItems: 'center',
    },
    emptyState: {
        marginTop: Spacing.xxl,
        alignItems: 'center',
    },
});
