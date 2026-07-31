import { AppConfig } from '@/src/constants';
import { injectReconciledMarkersIntoTransactionList } from '@/src/features/accounts/mappers/accountTransactionListPresentation';
import { useLedgerTransactionsForAccount } from '@/src/hooks/useLedgerTransactions';
import { useSelection } from '@/src/hooks/useSelection';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { buildDayNetStats } from '@/src/services/ledger';
import { mapAccountLedgerTransactionToListItem } from '@/src/services/ledger/accountLedgerListItems';
import { sharingService } from '@/src/services/SharingService';
import { TransactionShareProvider } from '@/src/services/sharing/TransactionShareProvider';
import {
  AccountId,
  DisplayTransaction,
  JournalDisplayType,
  TransactionId,
  WorkplaceId,
} from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { DateRange } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo } from 'react';

export interface UseAccountTransactionFeedOptions {
  accountId: AccountId;
  workplaceId: WorkplaceId;
  dateRange: DateRange | null;
  balanceCurrency: string;
  precision: number;
  reconciledAt: Date | null;
  accountName?: string;
  workplaceCurrency: string;
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
  onShareSelected: () => void;
}

export function useAccountTransactionFeed(
  options: UseAccountTransactionFeedOptions,
): AccountTransactionFeed {
  const {
    accountId,
    workplaceId,
    dateRange,
    balanceCurrency,
    precision,
    reconciledAt,
    accountName,
    workplaceCurrency,
  } = options;
  const { defaultShareFormat } = useSharePrefs();

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

  const onShareSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      const selectedTransactions = transactions.filter(t => selectedIds.has(t.id));
      const provider = new TransactionShareProvider(
        selectedTransactions.map(t => ({
          id: t.id,
          date: t.transactionDate,
          description: t.journalDescription || t.displayTitle || 'Transaction',
          amount: t.amount,
          currencyCode: t.currencyCode,
          displayType: (t.displayType as JournalDisplayType) || JournalDisplayType.MIXED,
        })),
        {
          title: `Transactions for ${accountName || 'Account'}`,
          includeTime: true,
          sort: 'desc',
          showEmojis: true,
          defaultCurrency: workplaceCurrency,
        },
      );
      await sharingService.share(provider, defaultShareFormat);
    } catch (error) {
      logger.error('Failed to share transactions', error);
    }
  }, [selectedIds, transactions, accountName, workplaceCurrency, defaultShareFormat]);

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
    onShareSelected,
  };
}
