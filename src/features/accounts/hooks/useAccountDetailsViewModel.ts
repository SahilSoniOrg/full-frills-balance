import { useUI } from '@/src/contexts/UIContext';
import {
  AccountDetailsViewModel,
  PeriodMetrics,
  SubAccountViewModel,
} from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useAccountDetailsActions } from '@/src/features/accounts/hooks/details/useAccountDetailsActions';
import { useAccountDetailsData } from '@/src/features/accounts/hooks/details/useAccountDetailsData';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { useAccountHierarchyTree } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { useAccountTransactionFeed } from '@/src/features/accounts/hooks/details/useAccountTransactionFeed';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccounts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

export type { AccountDetailsViewModel, PeriodMetrics, SubAccountViewModel };

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
  const { defaultShareFormat } = useUI();
  const data = useAccountDetailsData();
  const {
    accountId,
    workplaceId,
    workplaceCurrency,
    account,
    balanceData,
    accounts,
    rawSubBalances,
    dashboardLoading,
    accountLoading,
    accountMissing,
    accountName,
    accountType,
    accountSubtypeLabel,
    accountTypeVariant,
    accountIcon,
    accountTypeColorKey,
    isDeleted,
    isAssetOrExpense,
    balanceCurrency,
    balanceText,
    transactionCount,
    transactionCountText,
    reconciledAt,
    dateRange,
    periodFilter,
    isDatePickerVisible,
    showDatePicker,
    hideDatePicker,
    navigatePrevious,
    navigateNext,
    onDateSelect,
    unreconciledCount,
    unreconciledAmountText,
  } = data;

  const {
    deleteAccount,
    recoverAccount: recoverAction,
    reconcileAccount,
    mergeAccounts,
  } = useAccountActions(workplaceId);

  const {
    precision,
    secondaryBalances,
    periodMetrics,
    periodMetricsFormatted,
    chartData,
    rollingAverageData,
    xTicks,
  } = useAccountDetailsMetrics({
    accountId,
    workplaceId,
    accountType,
    isAssetOrExpense,
    balanceCurrency,
    dateRange,
    balanceData,
  });

  const {
    isParent,
    subAccountCount,
    subAccounts,
    subAccountsLoading,
    isSubAccountsModalVisible,
    onShowSubAccounts,
    onHideSubAccounts,
  } = useAccountHierarchyTree({
    accountId,
    account,
    accounts,
    rawSubBalances,
    workplaceCurrency,
    dashboardLoading,
  });

  const {
    transactions,
    transactionsLoading,
    transactionsLoadingMore,
    transactionItems,
    onLoadMore,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    toggleSelection,
    selectAll,
    clearItems,
    exitSelectionMode,
    setSelectedIds,
  } = useAccountTransactionFeed({
    accountId,
    workplaceId,
    dateRange,
    balanceCurrency,
    precision,
    reconciledAt,
  });

  const {
    headerActions,
    isReconcileModalVisible,
    setIsReconcileModalVisible,
    onConfirmReconcile,
    isMergeModalVisible,
    setIsMergeModalVisible,
    mergeCandidates,
    onConfirmMerge,
    onShareSelected,
  } = useAccountDetailsActions({
    accountId,
    account,
    accounts,
    transactionCount,
    isDeleted,
    workplaceCurrency,
    defaultShareFormat,
    deleteAccount,
    recoverAction,
    reconcileAccount,
    mergeAccounts,
    transactions,
    selectedIds,
  });

  return {
    accountId,
    accountLoading,
    accountMissing,
    accountName,
    accountType,
    accountSubtypeLabel,
    accountTypeVariant,
    accountIcon,
    accountTypeColorKey,
    isDeleted,
    currencyCode: balanceCurrency,
    balanceText,
    transactionCountText,
    headerActions,
    isReconcileModalVisible,
    setIsReconcileModalVisible,
    onConfirmReconcile,
    reconciledAt,
    onBack: useCallback(() => AppNavigation.back(), []),
    onAuditPress: useCallback(
      () => AppNavigation.toAuditLog({ entityType: 'account', entityId: accountId }),
      [accountId],
    ),
    onAddPress: useCallback(
      () => AppNavigation.toJournalEntry({ sourceAccountId: accountId }),
      [accountId],
    ),
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
    unreconciledCount,
    unreconciledAmountText,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    toggleSelection,
    selectAll,
    clearItems,
    exitSelectionMode,
    onShareSelected,
    setSelectedIds,
    isMergeModalVisible,
    setIsMergeModalVisible,
    mergeCandidates,
    onConfirmMerge,
  };
}
