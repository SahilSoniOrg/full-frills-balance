import { AccountPickerModal } from '@/src/components/account-selection/AccountPickerModal';
import { AccountArchiveCascadeModal } from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { JournalEntryListView } from '@/src/components/journal/JournalEntryListView';
import { EmptyStateView, Icon, LoadingView } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Layout, Spacing } from '@/src/constants';
import { AccountDetailsListHeader } from '@/src/features/accounts/components/AccountDetailsListHeader';
import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { JournalListModals } from '@/src/features/journal';
import { logAccountPerformanceMarker } from '@/src/testing/accountPerformanceMarkers';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

export function AccountDetailsView({
  chrome,
  secondaryContentReady = true,
  ...vm
}: AccountDetailsViewModel & {
  chrome: ScreenNavChrome;
  secondaryContentReady?: boolean;
}) {
  const launchConfig = readE2eLaunchConfig();
  const accountRenderMode = launchConfig?.accountRenderMode ?? 'full';
  const isAccountPerfRun = launchConfig?.accountRenderMode !== undefined;
  const summaryLayoutReported = useRef(false);
  const usableContentReported = useRef(false);
  const secondaryContentReported = useRef(false);
  const activityLayoutReported = useRef(false);
  const {
    accountLoading,
    accountMissing,
    onBack,
    listHeader,
    isDatePickerVisible,
    hideDatePicker,
    periodFilter,
    onDateSelect,
    journalsLoading,
    journalsLoadingMore,
    journalItems,
    onLoadMore,
    subAccounts,
    subAccountsLoading,
    isSubAccountsModalVisible,
    onHideSubAccounts,
    onOpenSubAccount,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
  } = vm;

  const showActivity = secondaryContentReady && accountRenderMode !== 'summary-no-rows';
  const showActivityChart = accountRenderMode === 'full' || accountRenderMode === 'deferred-full';
  const showJournalRows =
    secondaryContentReady &&
    (accountRenderMode === 'full' ||
      accountRenderMode === 'deferred-full' ||
      accountRenderMode === 'no-chart');

  const onSummaryLayout = useCallback(() => {
    if (!isAccountPerfRun || summaryLayoutReported.current) return;
    summaryLayoutReported.current = true;
    logAccountPerformanceMarker('summary_layout', { mode: accountRenderMode });
  }, [accountRenderMode, isAccountPerfRun]);

  const onActivityLayout = useCallback(() => {
    if (!isAccountPerfRun || activityLayoutReported.current) return;
    activityLayoutReported.current = true;
    logAccountPerformanceMarker('activity_layout', { mode: accountRenderMode });
  }, [accountRenderMode, isAccountPerfRun]);

  useEffect(() => {
    if (
      !isAccountPerfRun ||
      usableContentReported.current ||
      accountLoading ||
      accountMissing ||
      vm.balanceAmount === null ||
      journalsLoading ||
      listHeader.activity.periodMetrics.isLoading ||
      (showActivityChart && listHeader.activity.chartData.length === 0)
    ) {
      return;
    }

    usableContentReported.current = true;
    logAccountPerformanceMarker('usable_content_commit', {
      mode: accountRenderMode,
      journalRows: journalItems.length,
      chartPoints: listHeader.activity.chartData.length,
    });
  }, [
    accountLoading,
    accountMissing,
    accountRenderMode,
    isAccountPerfRun,
    journalItems.length,
    journalsLoading,
    showActivityChart,
    listHeader.activity.chartData.length,
    listHeader.activity.periodMetrics.isLoading,
    vm.balanceAmount,
  ]);

  useEffect(() => {
    if (
      !isAccountPerfRun ||
      secondaryContentReported.current ||
      !secondaryContentReady ||
      !showActivity ||
      !showJournalRows ||
      accountLoading ||
      accountMissing ||
      vm.balanceAmount === null ||
      journalsLoading ||
      listHeader.activity.periodMetrics.isLoading ||
      (showActivityChart && listHeader.activity.chartData.length === 0)
    ) {
      return;
    }

    secondaryContentReported.current = true;
    logAccountPerformanceMarker('secondary_content_commit', {
      mode: accountRenderMode,
      journalRows: journalItems.length,
      chartPoints: listHeader.activity.chartData.length,
    });
  }, [
    accountLoading,
    accountMissing,
    accountRenderMode,
    isAccountPerfRun,
    journalItems.length,
    journalsLoading,
    listHeader.activity.chartData.length,
    listHeader.activity.periodMetrics.isLoading,
    secondaryContentReady,
    showActivityChart,
    showActivity,
    showJournalRows,
    vm.balanceAmount,
  ]);

  return (
    <ScreenWithChrome chrome={chrome}>
      {accountLoading ? (
        <LoadingView loading />
      ) : accountMissing ? (
        <EmptyStateView
          icon={Icon.Error}
          title={AppConfig.strings.accounts.missingTitle}
          subtitle={AppConfig.strings.accounts.missingSubtitle}
          primaryActionLabel={AppConfig.strings.common.goBack}
          onPrimaryAction={onBack}
        />
      ) : (
        <>
          <JournalEntryListView
            items={showJournalRows ? journalItems : []}
            isLoading={showJournalRows && journalsLoading}
            isLoadingMore={journalsLoadingMore}
            error={vm.journalError}
            retry={vm.retryJournals}
            suppressEmptyContent={!showJournalRows}
            onEndReached={onLoadMore}
            emptyTitle="No entries yet"
            emptySubtitle="Activity for this account will appear here."
            selectedIds={selectedIds}
            onLongPressItem={onLongPressItem}
            isSelectionModeActive={isSelectionModeActive}
            onExitSelectionMode={chrome.selection?.exitSelectionMode}
            ListHeaderComponent={
              <AccountDetailsListHeader
                {...listHeader}
                showActivity={showActivity}
                showActivityChart={showActivityChart}
                onSummaryLayout={onSummaryLayout}
                onActivityLayout={onActivityLayout}
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
            onOpenAccount={onOpenSubAccount}
            parent={{
              name: listHeader.summary.accountName,
              icon: listHeader.summary.accountIcon,
              accountType: listHeader.summary.accountType,
              color: listHeader.summary.accountColor,
              balanceAmount: vm.balanceAmount,
              currencyCode: vm.currencyCode,
            }}
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

          {vm.archiveCascadeModal ? (
            <AccountArchiveCascadeModal {...vm.archiveCascadeModal} />
          ) : null}
          {vm.mergePickerModal ? <AccountPickerModal {...vm.mergePickerModal} /> : null}

          {vm.modals ? <JournalListModals {...vm.modals} /> : null}
        </>
      )}
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Layout.listBottomInset.fab,
  },
});
