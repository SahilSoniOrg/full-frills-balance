import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account, { formatAccountSubtypeLabel } from '@/src/data/models/Account';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import {
  AccountDetailsViewModel,
  PeriodMetrics,
  SubAccountViewModel,
} from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useAccountDetailsActions } from '@/src/features/accounts/hooks/details/useAccountDetailsActions';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { useAccountHierarchyTree } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { useAccountActions, useAccountDashboard } from '@/src/features/accounts/hooks/useAccounts';
import { getAccountFallbackIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { useLedgerTransactionsForAccount } from '@/src/hooks/useLedgerTransactions';
import { useObservable } from '@/src/hooks/useObservable';
import { useSelection } from '@/src/hooks/useSelection';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { injectReconciledMarkersIntoTransactionList } from '@/src/services/accounting/accountTransactionListPresentation';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { buildDayNetStats } from '@/src/services/ledger';
import { mapAccountLedgerTransactionToListItem } from '@/src/services/ledger/accountLedgerListItems';
import {
  AccountBalance,
  AccountId,
  DisplayTransaction,
  JournalDisplayType,
  PlainAccount,
  TransactionId,
} from '@/src/types/domain';
import { getAccountTypeColorKey, getAccountTypeVariant } from '@/src/utils/accountCategory';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { of } from 'rxjs';

export type { AccountDetailsViewModel, PeriodMetrics, SubAccountViewModel };

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { defaultShareFormat } = useUI();
  const params = useLocalSearchParams<{
    accountId: AccountId;
    pName?: string;
    pBalance?: string;
    pCurrency?: string;
    pIcon?: string;
    pType?: string;
    pColor?: string;
    startDate?: string;
    endDate?: string;
  }>();
  const accountId = params.accountId;
  const startDateParam = params.startDate;
  const endDateParam = params.endDate;

  // --- Date Handling ---
  const initialDateRange = useMemo(() => {
    if (startDateParam && endDateParam) {
      const parsedStartDate = Number.parseInt(startDateParam, 10);
      const parsedEndDate = Number.parseInt(endDateParam, 10);
      if (!Number.isFinite(parsedStartDate) || !Number.isFinite(parsedEndDate)) {
        return null;
      }
      return { startDate: parsedStartDate, endDate: parsedEndDate };
    }
    return null;
  }, [startDateParam, endDateParam]);

  const {
    dateRange,
    periodFilter,
    isPickerVisible: isDatePickerVisible,
    showPicker: showDatePicker,
    hidePicker,
    setFilter,
    navigatePrevious,
    navigateNext,
  } = useDateRangeFilter({
    defaultToCurrentMonth: !initialDateRange,
    initialDateRange,
  });

  // --- Data Services ---
  const {
    account: dbAccount,
    balanceData: dbBalanceData,
    subAccounts: rawSubBalances,
    allAccounts: accounts,
    isLoading: dashboardLoading,
  } = useAccountDashboard(workplaceId, accountId, workplaceCurrency);

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

  // --- Selection State ---
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

  // --- Initial Data Extraction (Preview) ---
  const pName = params.pName;
  const pBalance = params.pBalance;
  const pCurrency = params.pCurrency;
  const pIcon = params.pIcon;
  const pType = params.pType;
  const pColor = params.pColor;

  const account = useMemo<Account | PlainAccount | null>(
    () =>
      dbAccount ||
      (pName
        ? {
            id: accountId,
            name: pName,
            accountType: (pType || 'ASSET') as any,
            currencyCode: pCurrency || workplaceCurrency,
            icon: (pIcon || getAccountFallbackIcon(pType)) as any,
            colorKey: pColor,
            deletedAt: undefined,
          }
        : null),
    [dbAccount, pName, accountId, pType, pCurrency, workplaceCurrency, pIcon, pColor],
  );

  const balanceData = useMemo(
    () =>
      dbBalanceData ||
      ((pBalance
        ? {
            accountId,
            balance: parseFloat(pBalance),
            currencyCode: pCurrency || account?.currencyCode || workplaceCurrency,
            transactionCount: 0,
          }
        : null) as AccountBalance | null),
    [dbBalanceData, pBalance, accountId, pCurrency, account?.currencyCode, workplaceCurrency],
  );

  // --- Derived State ---
  const accountLoading = dashboardLoading && !pName;
  const accountType = account?.accountType || '';
  const isAssetOrExpense = accountType === 'ASSET' || accountType === 'EXPENSE';
  const balanceCurrency = balanceData?.currencyCode || account?.currencyCode || workplaceCurrency;
  const balance = dbBalanceData?.balance || 0;
  const transactionCount = balanceData?.transactionCount || 0;
  const isDeleted = account?.deletedAt != null;
  const reconciledAt = (() => {
    if (!account?.reconciledAt) return null;
    return account.reconciledAt instanceof Date
      ? account.reconciledAt
      : new Date(account.reconciledAt);
  })();

  const accountSubtypeLabel = account?.accountSubtype
    ? formatAccountSubtypeLabel(account.accountSubtype)
    : '';
  const accountTypeVariant = getAccountTypeVariant(accountType);
  const accountTypeColorKey = getAccountTypeColorKey(accountType);
  const balanceText = account ? CurrencyFormatter.format(balance, balanceCurrency) : '...';
  const transactionCountText = String(transactionCount);

  // --- Composed Sub-Hooks ---
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

  // --- Handlers ---
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

  const onDateSelect = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      setFilter(range, filter);
      hidePicker();
    },
    [hidePicker, setFilter],
  );

  // --- Transaction List Grouping ---
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

  // --- Unreconciled Metrics ---
  const { data: unreconciledMetrics } = useObservable<{ count: number; total: number }>(
    () => {
      if (!accountId) return of({ count: 0, total: 0 });
      return transactionRawRepository.observeUnreconciledMetricsRaw(
        workplaceId,
        accountId,
        reconciledAt?.getTime() || null,
        isAssetOrExpense,
      );
    },
    [workplaceId, accountId, reconciledAt, isAssetOrExpense],
    { count: 0, total: 0 },
  );

  return {
    accountId,
    accountLoading,
    accountMissing: !accountLoading && !account,
    accountName: account?.name || '',
    accountType,
    accountSubtypeLabel,
    accountTypeVariant,
    accountIcon: account?.icon || null,
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
    hideDatePicker: hidePicker,
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
    unreconciledCount: unreconciledMetrics.count,
    unreconciledAmountText: CurrencyFormatter.format(unreconciledMetrics.total, balanceCurrency),
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
