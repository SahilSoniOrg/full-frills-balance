import { AppIcon, AppText, Box, FloatingActionButton } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountSections } from '@/src/utils/accountUtils';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function AccountsScreen() {
    const router = useRouter()
    const { theme } = useTheme()

    const { accounts, isLoading: accountsLoading } = useAccounts()

    const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(new Set())

    const handleAccountPress = (account: Account) => {
        router.push(`/account-details?accountId=${account.id}` as any)
    }

    const toggleSection = (title: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(title)) next.delete(title)
            else next.add(title)
            return next
        })
    }

    const handleCreateAccount = () => {
        router.push('/account-creation' as any)
    }

    // Combine accounts with their balances and group by type
    const sections = useMemo(() => {
        if (!accounts.length) return []
        return getAccountSections(accounts)
    }, [accounts])

    const renderHeader = () => (
        <Box direction="row" justify="flex-end" style={{ marginTop: Spacing.sm, marginBottom: Spacing.md }}>
            <TouchableOpacity
                onPress={() => router.push('/account-reorder' as any)}
                style={[styles.reorderButton, { borderColor: theme.border }]}
            >
                <AppIcon name="reorder" size={Size.iconXs} color={theme.primary} />
                <AppText variant="caption" weight="bold" color="primary">REORDER</AppText>
            </TouchableOpacity>
        </Box>
    )

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <SectionList
                sections={sections}
                refreshing={accountsLoading}
                onRefresh={() => { }} // Reactivity handles updates, but need prop for PullToRefresh visual
                keyExtractor={(item) => item.id}
                renderSectionHeader={({ section: { title, data } }) => {
                    const isCollapsed = collapsedSections.has(title)
                    return (
                        <TouchableOpacity
                            onPress={() => toggleSection(title)}
                            activeOpacity={0.7}
                            style={styles.sectionHeaderContainer}
                        >
                            <Box direction="row" align="center" justify="space-between" style={{ flex: 1 }}>
                                <Box direction="row" align="center" gap="sm">
                                    <AppText
                                        variant="subheading"
                                        weight="bold"
                                        color="secondary"
                                    >
                                        {title}
                                    </AppText>
                                    <View style={[styles.countBadge, { backgroundColor: theme.surfaceSecondary }]}>
                                        <AppText variant="caption" weight="bold" color="tertiary">
                                            {data.length}
                                        </AppText>
                                    </View>
                                </Box>
                                <AppIcon
                                    name={isCollapsed ? "chevronRight" : "chevronDown"}
                                    size={Size.iconSm}
                                    color={theme.textSecondary}
                                />
                            </Box>
                        </TouchableOpacity>
                    )
                }}
                renderItem={({ item, section }) => {
                    if (collapsedSections.has(section.title)) return null
                    return (
                        <AccountCard
                            account={item}
                            onPress={handleAccountPress}
                        />
                    )
                }}
                ListHeaderComponent={renderHeader()}
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

            <FloatingActionButton
                onPress={handleCreateAccount}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerButtons: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingHorizontal: Spacing.lg,
    },
    listContainer: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Size.fab + Spacing.xxxl, // Space for FAB overlap
    },
    sectionHeaderContainer: {
        marginTop: Spacing.md,
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
    reorderButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.md,
        borderRadius: Shape.radius.full,
        borderWidth: 1,
        backgroundColor: 'transparent',
    },
    emptyState: {
        marginTop: Spacing.xxl,
        alignItems: 'center',
    },
})
