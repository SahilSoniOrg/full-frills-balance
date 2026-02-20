import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { TransactionCard } from '@/src/components/common/TransactionCard';
import { AppButton, AppCard, AppText, Badge, FloatingActionButton, IconButton, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Shape, Size, Spacing } from '@/src/constants';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

export function AccountDetailsView(vm: AccountDetailsViewModel) {
    const { theme } = useTheme();
    const {
        accountLoading,
        accountMissing,
        accountName,
        accountType,
        accountTypeVariant,
        accountIcon,
        accountTypeColorKey,
        isDeleted,
        balanceText,
        transactionCountText,
        headerActions,
        onBack,
        onAuditPress,
        onAddPress,
        showFab,
        dateRange,
        periodFilter,
        isDatePickerVisible,
        showDatePicker,
        hideDatePicker,
        navigatePrevious,
        navigateNext,
        onDateSelect,
        transactionsLoading,
        transactionItems,
        secondaryBalances,
        isParent,
        subAccountCount,
        subAccounts,
        subAccountsLoading,
        isSubAccountsModalVisible,
        onShowSubAccounts,
        onHideSubAccounts,
    } = vm;

    if (accountLoading) {
        return (
            <Screen title="Details">
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            </Screen>
        );
    }

    if (accountMissing) {
        return (
            <Screen title="Details">
                <View style={styles.errorContainer}>
                    <AppText variant="body" color="error">
                        Account not found
                    </AppText>
                    <AppButton variant="outline" onPress={onBack}>
                        Go Back
                    </AppButton>
                </View>
            </Screen>
        );
    }

    const headerActionsNode = (
        <View style={styles.headerActions}>
            <IconButton
                name="history"
                onPress={onAuditPress}
                variant="surface"
                iconColor={theme.textSecondary}
            />
            {headerActions.canRecover ? (
                <IconButton
                    name="refresh"
                    onPress={headerActions.onRecover}
                    variant="surface"
                    iconColor={theme.income}
                />
            ) : (
                <>
                    <IconButton
                        testID="edit-button"
                        name="edit"
                        onPress={headerActions.onEdit}
                        variant="surface"
                        iconColor={theme.text}
                    />
                    <IconButton
                        testID="delete-button"
                        name="delete"
                        onPress={headerActions.onDelete}
                        variant="surface"
                        iconColor={theme.error}
                    />
                </>
            )}
        </View>
    );

    return (
        <Screen
            title={isParent ? 'Group Account' : 'Account Details'}
            headerActions={headerActionsNode}
        >
            <FlatList
                data={transactionItems}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <TransactionCard
                        {...item.cardProps}
                        onPress={item.onPress}
                    />
                )}
                ListHeaderComponent={
                    <View style={styles.headerListRegion}>
                        <AppCard elevation="sm" style={styles.accountInfoCard}>
                            <View style={styles.accountHeader}>
                                <IvyIcon
                                    name={accountIcon as any}
                                    label={accountName}
                                    color={theme[accountTypeColorKey as keyof typeof theme] as string}
                                    size={Size.avatarMd}
                                    shape={isParent ? 'square' : 'circle'}
                                />
                                <View style={styles.titleInfo}>
                                    <AppText variant="title">
                                        {accountName}
                                    </AppText>
                                    <View style={{ flexDirection: 'row', gap: Spacing.xs, alignItems: 'center' }}>
                                        <Badge variant={accountTypeVariant as any}>
                                            {accountType}
                                        </Badge>
                                        {isParent && (
                                            <Pressable
                                                onPress={onShowSubAccounts}
                                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                            >
                                                <Badge variant={accountTypeVariant as any} icon="hierarchy">
                                                    {subAccountCount} {subAccountCount === 1 ? 'SUB-ACCOUNT' : 'SUB-ACCOUNTS'}
                                                </Badge>
                                            </Pressable>
                                        )}
                                        {isDeleted && (
                                            <Badge variant="expense">
                                                DELETED
                                            </Badge>
                                        )}
                                    </View>
                                </View>
                            </View>

                            <View style={styles.accountStats}>
                                <View style={styles.statItem}>
                                    <AppText variant="caption" color="secondary">
                                        Current Balance
                                    </AppText>
                                    <AppText variant="heading">
                                        {balanceText}
                                    </AppText>
                                    {secondaryBalances.length > 0 && (
                                        <View style={styles.secondaryBalances}>
                                            {secondaryBalances.map((sb, idx) => (
                                                <AppText key={idx} variant="caption" color="secondary">
                                                    + {sb.amountText}
                                                </AppText>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                <View style={styles.statItem}>
                                    <AppText variant="caption" color="secondary">
                                        Transactions
                                    </AppText>
                                    <AppText variant="subheading">
                                        {transactionCountText}
                                    </AppText>
                                </View>
                            </View>
                        </AppCard>

                        <View style={styles.sectionHeader}>
                            <DateRangeFilter
                                fullWidth
                                range={dateRange}
                                onPress={showDatePicker}
                                onPrevious={navigatePrevious}
                                onNext={navigateNext}
                            />
                        </View>
                    </View>
                }
                ListEmptyComponent={
                    transactionsLoading ? (
                        <View style={{ padding: Spacing.lg }}>
                            <ActivityIndicator size="small" color={theme.primary} />
                        </View>
                    ) : (
                        <AppCard elevation="sm" padding="lg">
                            <AppText variant="body" color="secondary" style={styles.emptyText}>
                                No transactions yet
                            </AppText>
                        </AppCard>
                    )
                }
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
            />

            {showFab && (
                <FloatingActionButton
                    onPress={onAddPress}
                />
            )}

            <DateRangePicker
                visible={isDatePickerVisible}
                onClose={hideDatePicker}
                currentFilter={periodFilter}
                onSelect={onDateSelect}
            />

            <SubAccountListModal
                visible={isSubAccountsModalVisible}
                onClose={onHideSubAccounts}
                parentName={accountName}
                subAccounts={subAccounts}
                isLoading={subAccountsLoading}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.lg,
        padding: Spacing.lg,
    },
    headerActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    headerListRegion: {
        paddingVertical: Spacing.md,
    },
    accountInfoCard: {
        marginBottom: Spacing.lg,
        padding: Spacing.lg,
        borderRadius: Shape.radius.xl,
    },
    accountHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    titleInfo: {
        marginLeft: Spacing.md,
        flex: 1,
        gap: Spacing.xs,
    },
    accountStats: {
        flexDirection: 'row',
        gap: Spacing.xl,
        marginBottom: Spacing.md,
        paddingVertical: Spacing.md,
    },
    statItem: {
        flex: 1,
    },
    secondaryBalances: {
        marginTop: Spacing.xs,
        gap: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    emptyText: {
        textAlign: 'center',
    },
    listContainer: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xxxxl * 2.5,
    },
});
