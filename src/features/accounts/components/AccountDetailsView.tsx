import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { SelectionActionBar } from '@/src/components/common/SelectionActionBar';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { AppButton, AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants';
import { AccountDetailsHeader } from '@/src/features/accounts/components/AccountDetailsHeader';
import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function AccountDetailsView({
  chrome,
  ...vm
}: AccountDetailsViewModel & { chrome: ScreenNavChrome }) {
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
    balanceAmount,
    transactionCountText,
    onBack,
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
    periodMetrics,
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
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    selectAll,
    clearItems,
    onShareSelected,
    exitSelectionMode,
  } = vm;

  return (
    <ScreenWithChrome
      chrome={chrome}
      onBack={isSelectionModeActive ? exitSelectionMode : onBack}
      headerStyle={{ opacity: isSelectionModeActive ? 0.3 : 1 }}
    >
      {accountLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : accountMissing ? (
        <View style={styles.errorContainer}>
          <AppText variant="body" color="error">
            Account not found
          </AppText>
          <AppButton variant="outline" onPress={onBack}>
            Go Back
          </AppButton>
        </View>
      ) : (
        <>
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
                  balanceAmount={balanceAmount}
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
                  periodMetrics={periodMetrics}
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
            balanceAmount={vm.balanceAmount ?? 0}
            currencyCode={vm.currencyCode}
            unreconciledCount={vm.unreconciledCount}
          />

          <AccountPickerModal
            visible={vm.isMergeModalVisible}
            onClose={() => vm.setIsMergeModalVisible(false)}
            accounts={vm.mergeCandidates}
            onSelect={vm.onConfirmMerge}
            title="Merge Into Account"
          />
        </>
      )}
    </ScreenWithChrome>
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
