import { AppConfig } from '@/src/constants';
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
import { useAccountActions } from '@/src/features/accounts/hooks/useAccounts';
import { useLedgerTransactionsForAccount } from '@/src/hooks/useLedgerTransactions';
import { useSelection } from '@/src/hooks/useSelection';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { injectReconciledMarkersIntoTransactionList } from '@/src/services/accounting/accountTransactionListPresentation';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { buildDayNetStats } from '@/src/services/ledger';
import { mapAccountLedgerTransactionToListItem } from '@/src/services/ledger/accountLedgerListItems';
import { DisplayTransaction, JournalDisplayType, TransactionId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo } from 'react';

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
    transactions,
    isLoading: transactionsLoading,
    isLoadingMore: transactionsLoadingMore,
    hasMore,
    loadMore,
  } = useLedgerTransactionsForAccount(
    accountId,
    workplaceId,
    AppConfig.defaults.journalPageSize,
    dateRange || undefined,
  );

  const selectionControl = useSelection<TransactionId>();
  const {
    selectedIds,
    isSelectionModeActive,
    toggleSelection,
    onLongPressItem,
    clearItems,
    exitSelectionMode,
    setSelectedIds,
  } = selectionControl;

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

  const onTransactionPress = useCallback(
    (transaction: DisplayTransaction) => {
      if (isSelectionModeActive) {
        toggleSelection(transaction.id);
        return;
      }
      if (transaction.journalId) {
        const base = journalPresenter.getPresentation(
          transaction.displayType as JournalDisplayType,
          transaction.semanticLabel,
        );
        AppNavigation.toTransactionDetails(transaction.journalId, {
          title: transaction.journalDescription || transaction.displayTitle || 'Transaction',
          amount: transaction.amount,
          currencyCode: transaction.currencyCode,
          date: transaction.transactionDate,
          typeColor: base.colorKey,
          typeIcon: transaction.isIncrease ? 'arrowUp' : 'arrowDown',
          displayType: transaction.displayType,
        });
      }
    },
    [isSelectionModeActive, toggleSelection],
  );

  const transactionGroupingOptions = useMemo(
    () => ({
      items: transactions,
      getDate: (t: DisplayTransaction) => t.transactionDate,
      sortByDate: 'desc' as const,
      getStats: (txnsForDay: DisplayTransaction[]) =>
        buildDayNetStats(txnsForDay, balanceCurrency, precision, t =>
          t.isIncrease ? t.amount : -t.amount,
        ),
      renderItem: (transaction: DisplayTransaction) =>
        mapAccountLedgerTransactionToListItem(transaction, () => onTransactionPress(transaction)),
    }),
    [transactions, balanceCurrency, onTransactionPress, precision],
  );

  const { groupedItems: rawGroupedItems } = useTransactionGrouping(transactionGroupingOptions);

  const transactionItems = useMemo(
    () => injectReconciledMarkersIntoTransactionList(rawGroupedItems, reconciledAt),
    [rawGroupedItems, reconciledAt],
  );

  const selectAll = useCallback(() => {
    const visibleIds = transactionItems.filter(i => i.type === 'transaction').map(i => i.id);
    selectionControl.selectAll(visibleIds);
  }, [transactionItems, selectionControl]);

  useEffect(() => {
    if (selectedIds.size === 0) return;
    setSelectedIds(prev => {
      const validIds = new Set(transactions.map(t => t.id));
      const filtered = new Set([...prev].filter(id => validIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [transactions, selectedIds.size, setSelectedIds]);

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
    onLoadMore: hasMore ? loadMore : undefined,
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
