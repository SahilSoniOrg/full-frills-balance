import { AccountPickerModal } from '@/src/features/accounts';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { JournalEntryListView } from '@/src/components/common/JournalEntryListView';
import { AppButton, AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants';
import { AccountDetailsHeader } from '@/src/features/accounts/components/AccountDetailsHeader';
import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
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
                isArchived={isArchived}
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
  list: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
});
