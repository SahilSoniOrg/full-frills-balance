import { AppConfig } from '@/src/constants';
import { useLedgerTransactionsForAccount } from '@/src/hooks/useLedgerTransactions';
import { useSelection } from '@/src/hooks/useSelection';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { injectReconciledMarkersIntoTransactionList } from '@/src/features/accounts/mappers/accountTransactionListPresentation';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { buildDayNetStats } from '@/src/services/ledger';
import { mapAccountLedgerTransactionToListItem } from '@/src/services/ledger/accountLedgerListItems';
import {
  AccountId,
  DisplayTransaction,
  JournalDisplayType,
  TransactionId,
  WorkplaceId,
} from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { DateRange } from '@/src/utils/dateUtils';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo } from 'react';

export interface UseAccountTransactionFeedOptions {
  accountId: AccountId;
  workplaceId: WorkplaceId;
  dateRange: DateRange | null;
  balanceCurrency: string;
  precision: number;
  reconciledAt: Date | null;
}

export interface AccountTransactionFeed {
  transactions: DisplayTransaction[];
  transactionsLoading: boolean;
  transactionsLoadingMore: boolean;
  transactionItems: TransactionListItem[];
  onLoadMore?: () => void;
  selectedIds: Set<TransactionId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: TransactionId) => void;
  toggleSelection: (id: TransactionId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<TransactionId>>>;
}

export function useAccountTransactionFeed(
  options: UseAccountTransactionFeedOptions,
): AccountTransactionFeed {
  const { accountId, workplaceId, dateRange, balanceCurrency, precision, reconciledAt } = options;

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
    transactions,
    transactionsLoading,
    transactionsLoadingMore,
    transactionItems,
    onLoadMore: hasMore ? loadMore : undefined,
    selectedIds,
    isSelectionModeActive,
    onLongPressItem,
    toggleSelection,
    selectAll,
    clearItems,
    exitSelectionMode,
    setSelectedIds,
  };
}
