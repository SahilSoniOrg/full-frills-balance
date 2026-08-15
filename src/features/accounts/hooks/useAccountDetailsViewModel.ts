import {
  AccountDetailsViewModel,
  PeriodMetrics,
  SubAccountViewModel,
} from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useAccountDetailsActions } from '@/src/features/accounts/hooks/details/useAccountDetailsActions';
import { useAccountDetailsData } from '@/src/features/accounts/hooks/details/useAccountDetailsData';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { useAccountHierarchyTree } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { injectReconciledMarkersIntoJournalList } from '@/src/features/accounts/mappers/accountJournalListPresentation';
import { useJournalEntryList, useJournalsBulkOperations } from '@/src/features/journal';
import { useMemo } from 'react';

export type { AccountDetailsViewModel, PeriodMetrics, SubAccountViewModel };

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
  const data = useAccountDetailsData();
  const {
    workplaceId,
    workplaceCurrency,
    account,
    balanceData,
    accounts,
    rawSubBalances,
    dashboardLoading,
    balanceCurrency,
    accountId,
    accountType,
    isDeleted,
    reconciledAtMs,
    dateRange,
    accountName,
    accountSubtypeLabel,
    accountTypeVariant,
    accountIcon,
    accountTypeColorKey,
    accountColor,
    isArchived,
    balanceAmount,
    transactionCountText,
    isDatePickerVisible,
    showDatePicker,
    hideDatePicker: hidePicker,
    navigatePrevious,
    navigateNext,
    onDateSelect,
    periodFilter,
    unreconciledCount,
  } = data;

  const { recoverAccount: recoverAction, reconcileAccount } = useAccountActions(workplaceId);

  const metrics = useAccountDetailsMetrics({
    accountId,
    workplaceId,
    accountType,
    balanceCurrency,
    dateRange,
    balanceData,
  });

  const hierarchy = useAccountHierarchyTree({
    accountId,
    account,
    accounts,
    rawSubBalances,
    workplaceCurrency,
    dashboardLoading,
  });

  const viewer = useMemo(() => ({ accountId }), [accountId]);

  const journalList = useJournalEntryList({
    workplaceId,
    dateRange: dateRange ?? undefined,
    queryOptions: { accountIds: [accountId] },
    viewer,
    shareTitle: `Journal entries for ${account?.name || 'Account'}`,
    paginationPolicy: 'default',
  });

  const bulkOperations = useJournalsBulkOperations({
    workplaceId,
    journals: journalList.journals,
    selection: journalList,
    onShareSelected: journalList.onShareSelected,
  });

  const journalItems = useMemo(
    () => injectReconciledMarkersIntoJournalList(journalList.items, reconciledAtMs),
    [journalList.items, reconciledAtMs],
  );

  const actions = useAccountDetailsActions({
    accountId,
    account,
    accountType,
    isDeleted,
    dateRange,
    recoverAction,
    reconcileAccount,
  });

  const listHeader = useMemo(
    () => ({
      accountType,
      reconciledAtMs,
      currencyCode: balanceCurrency,
      summary: {
        accountName,
        accountIcon,
        accountType,
        accountSubtypeLabel,
        accountTypeVariant,
        accountTypeColorKey,
        accountColor,
        isParent: hierarchy.isParent,
        isDeleted,
        isArchived,
        subAccountCount: hierarchy.subAccountCount,
        onShowSubAccounts: hierarchy.onShowSubAccounts,
        balanceAmount,
        secondaryBalances: metrics.secondaryBalances,
        transactionCountText,
        onAuditPress: actions.onAuditPress,
      },
      activity: {
        dateRange,
        onShowDatePicker: showDatePicker,
        onPreviousPeriod: navigatePrevious,
        onNextPeriod: navigateNext,
        chartData: metrics.chartData,
        rollingAverageData: metrics.rollingAverageData,
        xTicks: metrics.xTicks,
        periodMetrics: metrics.periodMetrics,
        onReconcile: actions.onReconcile,
        unreconciledCount,
      },
    }),
    [
      reconciledAtMs,
      balanceCurrency,
      accountName,
      accountIcon,
      accountType,
      accountSubtypeLabel,
      accountTypeVariant,
      accountTypeColorKey,
      accountColor,
      hierarchy.isParent,
      hierarchy.subAccountCount,
      hierarchy.onShowSubAccounts,
      isDeleted,
      isArchived,
      balanceAmount,
      metrics.secondaryBalances,
      transactionCountText,
      actions.onAuditPress,
      dateRange,
      showDatePicker,
      navigatePrevious,
      navigateNext,
      metrics.chartData,
      metrics.rollingAverageData,
      metrics.xTicks,
      metrics.periodMetrics,
      actions.onReconcile,
      unreconciledCount,
    ],
  );

  return {
    accountLoading: data.accountLoading,
    accountMissing: data.accountMissing,
    accountType,
    isParent: hierarchy.isParent,
    isDeleted,
    headerActions: actions.headerActions,
    onAddPress: actions.onAddPress,
    onBack: actions.onBack,
    listHeader,
    isDatePickerVisible,
    hideDatePicker: hidePicker,
    periodFilter,
    onDateSelect,
    journalItems,
    journalsLoading: journalList.isLoading,
    journalsLoadingMore: journalList.isLoadingMore,
    onLoadMore: journalList.onEndReached,
    subAccounts: hierarchy.subAccounts,
    subAccountsLoading: hierarchy.subAccountsLoading,
    isSubAccountsModalVisible: hierarchy.isSubAccountsModalVisible,
    onHideSubAccounts: hierarchy.onHideSubAccounts,
    isReconcileModalVisible: actions.isReconcileModalVisible,
    setIsReconcileModalVisible: actions.setIsReconcileModalVisible,
    onConfirmReconcile: actions.onConfirmReconcile,
    balanceAmount,
    currencyCode: balanceCurrency,
    unreconciledCount,
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    selectAll: journalList.selectAll,
    clearItems: journalList.clearItems,
    exitSelectionMode: journalList.exitSelectionMode,
    onShareSelected: journalList.onShareSelected,
    actions: bulkOperations.actions,
    modals: bulkOperations.modals,
  };
}
