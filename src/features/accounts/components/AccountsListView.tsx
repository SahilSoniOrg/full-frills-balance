import { AppCard, AppIcon, AppText, Box, FloatingActionButton, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import { AccountsListViewModel, AccountCardViewModel, AccountSectionViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import React from 'react';
import { SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';

export function AccountsListView({
    theme,
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
    return (
        <Screen showBack={false}>
            <View style={styles.container}>
                <SectionList
                    sections={sections as any}
                    refreshing={isRefreshing}
                    onRefresh={onRefresh}
                    keyExtractor={(item: AccountCardViewModel) => item.id}
                    renderSectionHeader={({ section }: { section: AccountSectionViewModel }) => (
                        <TouchableOpacity
                            onPress={() => onToggleSection(section.title)}
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
                                        {section.title}
                                    </AppText>
                                    <View style={[styles.countBadge, { backgroundColor: theme.surfaceSecondary }]}>
                                        <AppText variant="caption" weight="bold" color="tertiary">
                                            {section.count}
                                        </AppText>
                                    </View>
                                </Box>
                                <Box direction="row" align="center" gap="md">
                                    <AppText variant="body" weight="bold" style={{ color: section.totalColor }}>
                                        {section.totalDisplay}
                                    </AppText>
                                    <AppIcon
                                        name={section.isCollapsed ? "chevronRight" : "chevronDown"}
                                        size={Size.iconSm}
                                        color={theme.textSecondary}
                                    />
                                </Box>
                            </Box>
                        </TouchableOpacity>
                    )}
                    renderItem={({ item, section }: { item: AccountCardViewModel; section: AccountSectionViewModel }) => {
                        if (section.isCollapsed) return null;
                        return (
                            <AccountCardView
                                account={item}
                                onPress={() => onAccountPress(item.id)}
                                dividerColor={theme.divider}
                                surfaceColor={theme.surface}
                            />
                        );
                    }}
                    ListHeaderComponent={
                        <View style={styles.header}>
                            <Box direction="row" align="center" justify="space-between" style={styles.screenHeaderTop}>
                                <AppText variant="title" weight="bold">Accounts</AppText>
                                <Box direction="row" align="center" gap="sm">
                                    <TouchableOpacity
                                        onPress={onTogglePrivacy}
                                        style={[styles.reorderIconButton, { backgroundColor: theme.surfaceSecondary }]}
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

                <FloatingActionButton onPress={onCreateAccount} />
            </View>
        </Screen>
    );
}

function AccountCardView({
    account,
    onPress,
    dividerColor,
    surfaceColor,
}: {
    account: AccountCardViewModel;
    onPress: () => void;
    dividerColor: string;
    surfaceColor: string;
}) {
    return (
        <AppCard
            elevation="sm"
            style={[styles.cardContainer, { backgroundColor: surfaceColor }]}
            padding="none"
        >
            <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
                <View style={[styles.headerSection, { backgroundColor: account.accentColor }]}
                >
                    <View style={styles.cardHeaderTop}>
                        <IvyIcon
                            name={account.icon as any}
                            label={account.name}
                            color={account.textColor}
                            size={Size.avatarSm}
                        />
                        <AppText variant="body" weight="bold" style={[styles.accountName, { color: account.textColor }]} numberOfLines={1}>
                            {account.name}
                        </AppText>
                    </View>

                    <View style={styles.balanceSection}>
                        <AppText variant="title" weight="bold" style={[styles.balanceText, { color: account.textColor }]}>
                            {account.balanceText}
                        </AppText>
                    </View>
                </View>

                {account.showMonthlyStats && (
                    <View
                        style={[styles.footerSection, { backgroundColor: surfaceColor }]}
                        accessibilityLabel={`Monthly statistics for ${account.name}`}
                        accessibilityRole="summary"
                    >
                        <View style={styles.statsColumn} accessibilityLabel={`Monthly Income: ${account.monthlyIncomeText}`}>
                            <AppText variant="caption" weight="bold" color="secondary" style={styles.statsLabel}>
                                MONTH INCOME
                            </AppText>
                            <AppText variant="body" weight="bold" style={styles.statsValue}>
                                {account.monthlyIncomeText}
                            </AppText>
                        </View>

                        <View style={[styles.divider, { backgroundColor: dividerColor }]} accessibilityRole="none" />

                        <View style={styles.statsColumn} accessibilityLabel={`Monthly Expenses: ${account.monthlyExpenseText}`}>
                            <AppText variant="caption" weight="bold" color="secondary" style={styles.statsLabel}>
                                MONTH EXPENSES
                            </AppText>
                            <AppText variant="body" weight="bold" style={styles.statsValue}>
                                {account.monthlyExpenseText}
                            </AppText>
                        </View>
                    </View>
                )}
            </TouchableOpacity>
        </AppCard>
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
    cardHeaderTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.md,
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
    cardContainer: {
        marginBottom: Spacing.lg,
        borderRadius: Shape.radius.xl,
        overflow: 'hidden',
    },
    headerSection: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.xxl,
    },
    accountName: {
        fontSize: Typography.sizes.lg,
        flex: 1,
    },
    balanceSection: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    balanceText: {
        fontSize: Typography.sizes.xxxl,
        fontFamily: Typography.fonts.bold,
    },
    footerSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
    },
    statsColumn: {
        flex: 1,
        alignItems: 'center',
    },
    statsLabel: {
        fontSize: Typography.sizes.xs,
        marginBottom: Spacing.xs,
    },
    statsValue: {
        fontSize: Typography.sizes.sm,
    },
    divider: {
        width: Spacing.xs,
        height: Spacing.xxl,
        borderRadius: 1,
    },
});
