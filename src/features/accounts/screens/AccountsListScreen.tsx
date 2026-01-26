import { Shape, Spacing } from '@/constants';
import { AppText, Box, FloatingActionButton } from '@/src/components/core';
import Account from '@/src/data/models/Account';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { NetWorthCard, useNetWorth } from '@/src/features/dashboard';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountSections } from '@/src/utils/accountUtils';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function AccountsScreen() {
    const router = useRouter()
    const { theme } = useTheme()

    const { accounts, isLoading: accountsLoading } = useAccounts()
    const { balances, netWorth, totalAssets, totalLiabilities, isLoading: worthLoading } = useNetWorth()

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
        <View>
            <NetWorthCard
                netWorth={netWorth}
                totalAssets={totalAssets}
                totalLiabilities={totalLiabilities}
                isLoading={worthLoading}
            />
            <Box direction="row" justify="flex-end" style={{ marginTop: Spacing.sm, marginBottom: Spacing.md }}>
                <TouchableOpacity
                    onPress={() => router.push('/account-reorder' as any)}
                    style={[styles.reorderButton, { borderColor: theme.border }]}
                >
                    <Ionicons name="swap-vertical" size={16} color={theme.primary} />
                    <AppText variant="caption" weight="bold" color="primary">REORDER</AppText>
                </TouchableOpacity>
            </Box>
        </View>
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
                                <Ionicons
                                    name={isCollapsed ? "chevron-forward" : "chevron-down"}
                                    size={18}
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
                            initialBalanceData={balances.find(b => b.accountId === item.id)}
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
        paddingBottom: 100, // Space for FAB - fine as layout constant for now or use a large spacing token? 
        // Actually Ivy uses a bottom padding to avoid FAB overlap. 100 is typical for RN FABs.
    },
    sectionHeaderContainer: {
        marginTop: Spacing.md,
        marginBottom: Spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
    },
    countBadge: {
        paddingHorizontal: Spacing.xs,
        paddingVertical: 2,
        borderRadius: Shape.radius.sm,
        minWidth: 20,
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
