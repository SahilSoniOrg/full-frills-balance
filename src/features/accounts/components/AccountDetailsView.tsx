import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { SelectionActionBar } from '@/src/components/common/SelectionActionBar';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { AppButton, AppText, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { AccountDetailsHeader } from '@/src/features/accounts/components/AccountDetailsHeader';
import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
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
    isPrivacyMode,
    onLoadMore,
    secondaryBalances,
    isParent,
    subAccountCount,
    subAccounts,
    subAccountsLoading,
    isSubAccountsModalVisible,
    onShowSubAccounts,
    onHideSubAccounts,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    selectAll,
    clearItems,
    onShareSelected,
    exitSelectionMode,
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

  const isCategory = accountType === 'INCOME' || accountType === 'EXPENSE';

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
          : ([
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
              !isCategory
                ? {
                    name: 'checkCircle',
                    onPress: headerActions.onReconcile,
                    variant: 'surface',
                    iconColor:
                      vm.unreconciledCount > 0
                        ? theme.warning
                        : vm.reconciledAt
                          ? theme.success
                          : theme.textSecondary,
                    testID: 'reconcile-button',
                  }
                : null,
              headerActions.canDelete
                ? {
                    name: 'delete',
                    onPress: headerActions.onDelete,
                    variant: 'surface',
                    iconColor: theme.error,
                    testID: 'delete-button',
                  }
                : null,
              headerActions.canMerge
                ? {
                    name: 'merge',
                    onPress: headerActions.onMerge,
                    variant: 'surface',
                    iconColor: theme.error,
                    testID: 'merge-button',
                  }
                : null,
            ].filter(Boolean) as any)
      }
    />
  );

  const screenTitle = isParent
    ? isCategory
      ? 'Group Category'
      : 'Group Account'
    : isCategory
      ? 'Category Details'
      : 'Account Details';

  return (
    <Screen
      title={screenTitle}
      headerActions={headerActionsNode}
      onBack={isSelectionModeActive ? exitSelectionMode : onBack}
      showBack={true}
      headerStyle={{ opacity: isSelectionModeActive ? 0.3 : 1 }}
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Backdrop (Back) - catches taps that miss the list entirely */}
        {isSelectionModeActive && (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
            onStartShouldSetResponder={() => {
              exitSelectionMode();
              return true;
            }}
          />
        )}
        <TransactionListView
          items={transactionItems}
          isLoading={transactionsLoading}
          isLoadingMore={transactionsLoadingMore}
          onEndReached={onLoadMore}
          emptyTitle="No transactions yet"
          emptySubtitle="Transactions for this account will appear here."
          isPrivacyMode={isPrivacyMode}
          selectedIds={selectedIds}
          onLongPressItem={onLongPressItem}
          isSelectionModeActive={isSelectionModeActive}
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
              currencyCode={vm.currencyCode}
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
          ListFooterComponent={
            <View
              onStartShouldSetResponder={() => {
                if (isSelectionModeActive) exitSelectionMode();
                return false;
              }}
              style={{ height: Spacing.xxxxl * 2 }}
            />
          }
          contentContainerStyle={styles.listContainer}
          style={{ flex: 1 }}
        />
      </View>

      <SelectionActionBar
        isVisible={isSelectionModeActive}
        selectedCount={selectedIds.size}
        totalCount={transactionItems.filter(i => i.type === 'transaction').length}
        onClear={exitSelectionMode}
        onSelectAll={selectAll}
        onDeselectAll={clearItems}
        onShare={onShareSelected}
      />

      {!isDeleted ? (
        <FloatingActionButton
          onPress={onAddPress}
          label="Add Transaction"
          icon="plusCircle"
          placement="end"
          accessibilityLabel="Add transaction for this account"
        />
      ) : null}

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

      <AccountPickerModal
        visible={vm.isMergeModalVisible}
        onClose={() => vm.setIsMergeModalVisible(false)}
        accounts={vm.mergeCandidates}
        onSelect={vm.onConfirmMerge}
        title="Merge Into Account"
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
    paddingBottom: Spacing.xxxxl,
  },
});
