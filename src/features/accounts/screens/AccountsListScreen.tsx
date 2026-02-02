import { AppIcon, AppText, Box, FloatingActionButton } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { AccountCard } from '@/src/features/accounts/components/AccountCard';
import { useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useSummary } from '@/src/features/dashboard/hooks/useSummary';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountSections } from '@/src/utils/accountUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

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

    const {
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalIncome,
        totalExpense,
        isPrivacyMode
    } = useSummary()

    const renderHeader = () => {
        const categories = [
            { label: 'Assets', value: totalAssets, color: theme.asset },
            { label: 'Liabilities', value: totalLiabilities, color: theme.liability },
            { label: 'Equity', value: totalEquity, color: theme.equity },
            { label: 'Income', value: totalIncome, color: theme.income },
            { label: 'Expenses', value: totalExpense, color: theme.expense },
        ]

        return (
            <View style={styles.header}>
                <Box direction="row" align="center" justify="space-between" style={styles.headerTop}>
                    <AppText variant="title" weight="bold">Accounts</AppText>
                    <TouchableOpacity
                        onPress={() => router.push('/account-reorder' as any)}
                        style={[styles.reorderIconButton, { backgroundColor: theme.surfaceSecondary }]}
                    >
                        <AppIcon name="reorder" size={Size.iconSm} color={theme.text} />
                    </TouchableOpacity>
                </Box>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.summaryScroll}
                >
                    {categories.map((cat, index) => (
                        <React.Fragment key={cat.label}>
                            <View style={styles.summaryItem}>
                                <AppText variant="caption" color="secondary" weight="bold">{cat.label.toUpperCase()}</AppText>
                                <AppText variant="subheading" weight="bold" style={{ color: cat.color }}>
                                    {isPrivacyMode ? '••••' : CurrencyFormatter.formatShort(cat.value)}
                                </AppText>
                            </View>
                            {index < categories.length - 1 && <View style={styles.summaryDivider} />}
                        </React.Fragment>
                    ))}
                </ScrollView>
            </View>
        )
    }

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
        backgroundColor: '#333',
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
