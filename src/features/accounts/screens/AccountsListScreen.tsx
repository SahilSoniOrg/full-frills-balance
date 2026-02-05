import { AppIcon, AppText, Box, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Shape, Size, Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import Account from '@/src/data/models/Account';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { useAccountBalances, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { useSummary } from '@/src/hooks/useSummary';
import { getAccountSections } from '@/src/utils/accountUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function AccountsScreen() {
    const router = useRouter()
    const { theme } = useTheme()

    const { defaultCurrency, setPrivacyMode } = useUI()
    const { accounts, isLoading: accountsLoading, version: accountsVersion } = useAccounts()
    const { balancesByAccountId, isLoading: balancesLoading } = useAccountBalances(accounts)

    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['Equity']))

    const handleAccountPress = useCallback((account: Account) => {
        router.push(`/account-details?accountId=${account.id}` as any)
    }, [router])

    const toggleSection = useCallback((title: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(title)) next.delete(title)
            else next.add(title)
            return next
        })
    }, [])

    const handleCreateAccount = useCallback(() => {
        router.push('/account-creation' as any)
    }, [router])

    const handleReorderPress = useCallback(() => {
        router.push('/account-reorder' as any)
    }, [router])

    const handleRefresh = useCallback(() => { }, [])

    // Combine accounts with their balances and group by type
    const sections = useMemo(() => {
        if (!accounts.length) return []
        return getAccountSections(accounts)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accounts, accountsVersion])

    const {
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalIncome,
        totalExpense,
        isPrivacyMode
    } = useSummary()





    const renderSectionHeader = useCallback(({ section: { title, data } }: { section: { title: string; data: Account[] } }) => {
        const isCollapsed = collapsedSections.has(title)

        let sectionColor = theme.text
        let sectionTotal = 0

        if (title === 'Assets') {
            sectionColor = theme.asset
            sectionTotal = totalAssets
        } else if (title === 'Liabilities') {
            sectionColor = theme.liability
            sectionTotal = totalLiabilities
        } else if (title === 'Equity') {
            sectionColor = theme.equity
            sectionTotal = totalEquity
        } else if (title === 'Income') {
            sectionColor = theme.income
            sectionTotal = totalIncome
        } else if (title === 'Expenses') {
            sectionColor = theme.expense
            sectionTotal = totalExpense
        }

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
                    <Box direction="row" align="center" gap="md">
                        <AppText variant="body" weight="bold" style={{ color: sectionColor }}>
                            {isPrivacyMode ? '••••' : CurrencyFormatter.formatShort(sectionTotal, defaultCurrency || AppConfig.defaultCurrency)}
                        </AppText>
                        <AppIcon
                            name={isCollapsed ? "chevronRight" : "chevronDown"}
                            size={Size.iconSm}
                            color={theme.textSecondary}
                        />
                    </Box>
                </Box>
            </TouchableOpacity>
        )
    }, [collapsedSections, defaultCurrency, isPrivacyMode, theme.asset, theme.equity, theme.expense, theme.income, theme.liability, theme.surfaceSecondary, theme.text, theme.textSecondary, totalAssets, totalEquity, totalExpense, totalIncome, totalLiabilities, toggleSection])

    const renderItem = useCallback(({ item, section }: { item: Account; section: { title: string } }) => {
        if (collapsedSections.has(section.title)) return null
        const balanceData = balancesByAccountId.get(item.id) || null
        return (
            <AccountCard
                account={item}
                onPress={handleAccountPress}
                balanceData={balanceData}
                isLoading={balancesLoading}
            />
        )
    }, [balancesByAccountId, balancesLoading, collapsedSections, handleAccountPress])

    const keyExtractor = useCallback((item: Account) => item.id, [])

    return (
        <Screen showBack={false}>
            <SectionList
                sections={sections}
                extraData={accountsVersion}
                refreshing={accountsLoading}
                onRefresh={handleRefresh} // Reactivity handles updates, but need prop for PullToRefresh visual
                keyExtractor={keyExtractor}
                renderSectionHeader={renderSectionHeader}
                renderItem={renderItem}
                ListHeaderComponent={
                    <View style={styles.header}>
                        <Box direction="row" align="center" justify="space-between" style={styles.headerTop}>
                            <AppText variant="title" weight="bold">Accounts</AppText>
                            <Box direction="row" align="center" gap="sm">
                                <TouchableOpacity
                                    onPress={() => setPrivacyMode(!isPrivacyMode)}
                                    style={[styles.reorderIconButton, { backgroundColor: theme.surfaceSecondary }]}
                                >
                                    <AppIcon
                                        name={isPrivacyMode ? "eyeOff" : "eye"}
                                        size={Size.iconSm}
                                        color={theme.text}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleReorderPress}
                                    style={[styles.reorderIconButton, { backgroundColor: theme.surfaceSecondary }]}
                                >
                                    <AppIcon name="reorder" size={Size.iconSm} color={theme.text} />
                                </TouchableOpacity>
                            </Box>
                        </Box>
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

            <FloatingActionButton
                onPress={handleCreateAccount}
            />
        </Screen>
    )
}

const styles = StyleSheet.create({
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
    header: {
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.lg,
    },
    headerTop: {
        marginBottom: Spacing.xl,
    },
    reorderIconButton: {
        width: Size.xl,
        height: Size.xl,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    summaryScroll: {
        paddingRight: Spacing.lg,
    },
    summaryItem: {
        minWidth: 80,
    },
    summaryDivider: {
        width: 1,
        height: 30,
        marginHorizontal: Spacing.md,
        alignSelf: 'center',
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
