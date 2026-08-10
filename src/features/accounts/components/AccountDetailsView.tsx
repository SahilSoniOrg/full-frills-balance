import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { JournalEntryListView } from '@/src/components/common/JournalEntryListView';
import { AppButton, AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants';
import { AccountActivitySection } from '@/src/features/accounts/components/AccountActivitySection';
import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
import { AccountSummaryCard } from '@/src/features/accounts/components/AccountSummaryCard';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';
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
    isArchived,
    balanceAmount,
    transactionCountText,
    reconciledAt,
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
    journalsLoading,
    journalsLoadingMore,
    journalItems,
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
    onAuditPress,
    onReconcilePress,
    unreconciledCount,
    currencyCode,
  } = vm;

  const selectionChrome = useMemo(
    () => ({
      exitSelectionMode,
      selectAll,
      clearItems,
      onShareSelected,
    }),
    [exitSelectionMode, selectAll, clearItems, onShareSelected],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerListRegion}>
        <AccountSummaryCard
          accountName={accountName}
          accountIcon={accountIcon}
          accountType={accountType}
          accountSubtypeLabel={accountSubtypeLabel}
          accountTypeVariant={accountTypeVariant}
          accountTypeColorKey={accountTypeColorKey}
          isParent={isParent}
          isDeleted={isDeleted}
          isArchived={isArchived}
          subAccountCount={subAccountCount}
          onShowSubAccounts={onShowSubAccounts}
          balanceAmount={balanceAmount}
          currencyCode={currencyCode}
          secondaryBalances={secondaryBalances}
          transactionCountText={transactionCountText}
          reconciledAt={reconciledAt}
          onAuditPress={onAuditPress}
        />
        <AccountActivitySection
          accountType={accountType}
          reconciledAt={reconciledAt}
          dateRange={dateRange}
          onShowDatePicker={showDatePicker}
          onPreviousPeriod={navigatePrevious}
          onNextPeriod={navigateNext}
          chartData={chartData}
          rollingAverageData={rollingAverageData}
          xTicks={xTicks}
          periodMetrics={periodMetrics}
          currencyCode={currencyCode}
          onReconcile={onReconcilePress}
          unreconciledCount={unreconciledCount}
        />
      </View>
    ),
    [
      accountName,
      accountIcon,
      accountType,
      accountSubtypeLabel,
      accountTypeVariant,
      accountTypeColorKey,
      isParent,
      isDeleted,
      isArchived,
      subAccountCount,
      onShowSubAccounts,
      balanceAmount,
      currencyCode,
      secondaryBalances,
      transactionCountText,
      reconciledAt,
      onAuditPress,
      dateRange,
      showDatePicker,
      navigatePrevious,
      navigateNext,
      chartData,
      rollingAverageData,
      xTicks,
      periodMetrics,
      onReconcilePress,
      unreconciledCount,
    ],
  );

  return (
    <ScreenWithChrome chrome={chrome}>
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
          <JournalEntryListView
            items={journalItems}
            isLoading={journalsLoading}
            isLoadingMore={journalsLoadingMore}
            onEndReached={onLoadMore}
            emptyTitle="No journal entries yet"
            emptySubtitle="Journal entries for this account will appear here."
            selectedIds={selectedIds}
            onLongPressItem={onLongPressItem}
            isSelectionModeActive={isSelectionModeActive}
            selectionChrome={selectionChrome}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listContainer}
            style={styles.list}
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
  list: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
  headerListRegion: {
    paddingVertical: Spacing.md,
  },
});
