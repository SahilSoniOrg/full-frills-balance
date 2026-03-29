import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { AppButton, AppText, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing } from '@/src/constants';
import { AccountDetailsHeader } from '@/src/features/accounts/components/AccountDetailsHeader';
import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function AccountDetailsView(vm: AccountDetailsViewModel) {
    const { theme } = useTheme();
    const {
        accountLoading,
        accountMissing,
        accountName,
        accountType,
        accountSubtypeLabel,
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
        chartData,
        rollingAverageData,
        xTicks,
        periodMetricsFormatted,
        transactionsLoading,
        transactionsLoadingMore,
        transactionItems,
        onLoadMore,
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
        <ScreenHeaderActions
            actions={
                headerActions.canRecover
                    ? [
                        {
                            name: 'history',
                            onPress: onAuditPress,
                            variant: 'surface',
                            iconColor: theme.textSecondary,
                        },
                        {
                            name: 'refresh',
                            onPress: headerActions.onRecover,
                            variant: 'surface',
                            iconColor: theme.income,
                        },
                    ]
                    : [
                        {
                            name: 'history',
                            onPress: onAuditPress,
                            variant: 'surface',
                            iconColor: theme.textSecondary,
                        },
                        {
                            name: 'edit',
                            onPress: headerActions.onEdit,
                            variant: 'surface',
                            iconColor: theme.text,
                            testID: 'edit-button',
                        },
                        {
                            name: 'checkCircle',
                            onPress: headerActions.onReconcile,
                            variant: 'surface',
                            iconColor: vm.unreconciledCount > 0 ? theme.warning : (vm.reconciledAt ? theme.success : theme.textSecondary),
                            testID: 'reconcile-button',
                        },
                        {
                            name: 'delete',
                            onPress: headerActions.onDelete,
                            variant: 'surface',
                            iconColor: theme.error,
                            testID: 'delete-button',
                        },
                    ]
            }
        />
    );

    return (
        <Screen
            title={isParent ? 'Group Account' : 'Account Details'}
            headerActions={headerActionsNode}
        >
            <TransactionListView
                items={transactionItems}
                isLoading={transactionsLoading}
                isLoadingMore={transactionsLoadingMore}
                onEndReached={onLoadMore}
                emptyTitle="No transactions yet"
                emptySubtitle="Transactions for this account will appear here."
                ListHeaderComponent={
                    <AccountDetailsHeader
                        accountName={accountName}
                        accountIcon={accountIcon}
                        accountType={accountType}
                        accountSubtypeLabel={accountSubtypeLabel}
                        accountTypeVariant={accountTypeVariant}
                        accountTypeColorKey={accountTypeColorKey}
                        isParent={isParent}
                        isDeleted={isDeleted}
                        subAccountCount={subAccountCount}
                        onShowSubAccounts={onShowSubAccounts}
                        balanceText={balanceText}
                        secondaryBalances={secondaryBalances}
                        transactionCountText={transactionCountText}
                        reconciledAt={vm.reconciledAt}
                        dateRange={dateRange}
                        onShowDatePicker={showDatePicker}
                        onPreviousPeriod={navigatePrevious}
                        onNextPeriod={navigateNext}
                        chartData={chartData}
                        rollingAverageData={rollingAverageData}
                        xTicks={xTicks}
                        periodMetricsFormatted={periodMetricsFormatted}
                    />
                }
                contentContainerStyle={styles.listContainer}
                estimatedItemSize={AppConfig.layout.listEstimatedItemSize}
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

            <AccountReconcileDialog
                visible={vm.isReconcileModalVisible}
                onClose={() => vm.setIsReconcileModalVisible(false)}
                onConfirm={vm.onConfirmReconcile}
                balanceText={vm.balanceText}
                unreconciledCount={vm.unreconciledCount}
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
    listContainer: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xxxxl * 2.5,
    },
});
