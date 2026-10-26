import { AccountPickerModal } from '@/src/components/account-selection/AccountPickerModal';
import { AccountArchiveCascadeModal } from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { JournalEntryListView } from '@/src/components/journal/JournalEntryListView';
import { AppButton, AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Size, Spacing } from '@/src/constants';
import { AccountDetailsListHeader } from '@/src/features/accounts/components/AccountDetailsListHeader';
import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { JournalListModals } from '@/src/features/journal';
import { useTheme } from '@/src/hooks/use-theme';
import { logAccountPerformanceMarker } from '@/src/testing/accountPerformanceMarkers';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function AccountDetailsView({
  chrome,
  secondaryContentReady = true,
  ...vm
}: AccountDetailsViewModel & {
  chrome: ScreenNavChrome;
  secondaryContentReady?: boolean;
}) {
  const { theme } = useTheme();
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
    selectionChrome,
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
            items={showJournalRows ? journalItems : []}
            isLoading={showJournalRows && journalsLoading}
            isLoadingMore={journalsLoadingMore}
            suppressEmptyContent={!showJournalRows}
            onEndReached={onLoadMore}
            emptyTitle="No entries yet"
            emptySubtitle="Activity for this account will appear here."
            selectedIds={selectedIds}
            onLongPressItem={onLongPressItem}
            isSelectionModeActive={isSelectionModeActive}
            selectionChrome={selectionChrome}
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
    paddingBottom: Size.fab + Spacing.xxxxl + Spacing.lg,
  },
});
