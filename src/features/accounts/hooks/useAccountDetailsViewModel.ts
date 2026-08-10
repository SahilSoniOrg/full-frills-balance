import {
  AccountDetailsViewModel,
  PeriodMetrics,
  SubAccountViewModel,
} from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useAccountDetailsActions } from '@/src/features/accounts/hooks/details/useAccountDetailsActions';
import { useAccountDetailsData } from '@/src/features/accounts/hooks/details/useAccountDetailsData';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { useAccountHierarchyTree } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { injectReconciledMarkersIntoJournalList } from '@/src/features/accounts/mappers/accountJournalListPresentation';
import { useJournalEntryList } from '@/src/features/journal';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { useMemo } from 'react';

export type { AccountDetailsViewModel, PeriodMetrics, SubAccountViewModel };

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
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
    isArchived,
    balanceAmount,
    transactionCountText,
    isDatePickerVisible,
    showDatePicker,
    hideDatePicker: hidePicker,
    navigatePrevious,
    navigateNext,
    onDateSelect,
    ...dataVm
  } = useAccountDetailsData();

  const { recoverAccount: recoverAction, reconcileAccount } = useAccountActions(workplaceId);

  const { precision, ...metricsVm } = useAccountDetailsMetrics({
    accountId,
    workplaceId,
    accountType,
    balanceCurrency,
    dateRange,
    balanceData,
  });

  const hierarchyVm = useAccountHierarchyTree({
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

  const journalItems = useMemo(
    () => injectReconciledMarkersIntoJournalList(journalList.items, reconciledAtMs),
    [journalList.items, reconciledAtMs],
  );

  const actionsVm = useAccountDetailsActions({
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
      summary: {
        accountName,
        accountIcon,
        accountType,
        accountSubtypeLabel,
        accountTypeVariant,
        accountTypeColorKey,
        isParent: hierarchyVm.isParent,
        isDeleted,
        isArchived,
        subAccountCount: hierarchyVm.subAccountCount,
        onShowSubAccounts: hierarchyVm.onShowSubAccounts,
        balanceAmount,
        currencyCode: balanceCurrency,
        secondaryBalances: metricsVm.secondaryBalances,
        transactionCountText,
        reconciledAtMs,
        onAuditPress: actionsVm.onAuditPress,
      },
      activity: {
        accountType,
        reconciledAtMs,
        dateRange,
        onShowDatePicker: showDatePicker,
        onPreviousPeriod: navigatePrevious,
        onNextPeriod: navigateNext,
        chartData: metricsVm.chartData,
        rollingAverageData: metricsVm.rollingAverageData,
        xTicks: metricsVm.xTicks,
        periodMetrics: metricsVm.periodMetrics,
        currencyCode: balanceCurrency,
        onReconcile: actionsVm.onReconcilePress,
        unreconciledCount: dataVm.unreconciledCount,
      },
    }),
    [
      accountName,
      accountIcon,
      accountType,
      accountSubtypeLabel,
      accountTypeVariant,
      accountTypeColorKey,
      hierarchyVm.isParent,
      hierarchyVm.subAccountCount,
      hierarchyVm.onShowSubAccounts,
      metricsVm.secondaryBalances,
      isDeleted,
      isArchived,
      balanceAmount,
      balanceCurrency,
      transactionCountText,
      reconciledAtMs,
      actionsVm.onAuditPress,
      actionsVm.onReconcilePress,
      dateRange,
      showDatePicker,
      navigatePrevious,
      navigateNext,
      metricsVm.chartData,
      metricsVm.rollingAverageData,
      metricsVm.xTicks,
      metricsVm.periodMetrics,
      dataVm.unreconciledCount,
    ],
  );

  return {
    accountId,
    accountType,
    isDeleted,
    reconciledAtMs,
    listHeader,
    dateRange,
    currencyCode: balanceCurrency,
    accountName,
    accountSubtypeLabel,
    accountTypeVariant,
    accountIcon,
    accountTypeColorKey,
    isArchived,
    balanceAmount,
    transactionCountText,
    isDatePickerVisible,
    showDatePicker,
    hideDatePicker: hidePicker,
    navigatePrevious,
    navigateNext,
    onDateSelect,
    ...dataVm,
    ...metricsVm,
    ...hierarchyVm,
    journalItems,
    journalsLoading: journalList.isLoading,
    journalsLoadingMore: journalList.isLoadingMore,
    onLoadMore: journalList.onEndReached,
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    toggleSelection: journalList.toggleSelection,
    selectAll: journalList.selectAll,
    clearItems: journalList.clearItems,
    exitSelectionMode: journalList.exitSelectionMode,
    onShareSelected: journalList.onShareSelected,
    setSelectedIds: journalList.setSelectedIds,
    ...actionsVm,
  };
}
