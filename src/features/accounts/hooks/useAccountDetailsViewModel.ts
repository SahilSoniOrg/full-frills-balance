import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account, { formatAccountSubtypeLabel } from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useAccountActions, useAccountDashboard } from '@/src/features/accounts/hooks/useAccounts';
import {
  getAccountFallbackIcon,
  getAccountIcon,
} from '@/src/features/accounts/utils/getAccountIcon';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { useObservable } from '@/src/hooks/useObservable';
import { useSelection } from '@/src/hooks/useSelection';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { sharingService } from '@/src/services/SharingService';
import { useLedgerTransactionsForAccount } from '@/src/hooks/useLedgerTransactions';
import { TransactionShareProvider } from '@/src/services/sharing/TransactionShareProvider';
import {
  AccountBalance,
  AccountId,
  DisplayTransaction,
  JournalDisplayType,
  PlainAccount,
  TransactionId,
} from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { getAccountTypeColorKey, getAccountTypeVariant } from '@/src/utils/accountCategory';
import { confirm, showConfirmationAlert, showErrorAlert, toast } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { logger } from '@/src/utils/logger';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { AppNavigation } from '@/src/utils/navigation';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { map, of } from 'rxjs';

export interface PeriodMetrics {
  totalIncrease: number;
  totalDecrease: number;
  netChange: number;
  dailyAverage: number | null;
  isLoading: boolean;
}

export interface SubAccountViewModel {
  id: string;
  name: string;
  icon: IconName;
  balanceText: string;
  color: string;
  level: number;
  isGroup: boolean;
}

export interface AccountDetailsViewModel {
  accountId: AccountId;
  accountLoading: boolean;
  accountMissing: boolean;
  accountName: string;
  accountType: string;
  accountSubtypeLabel: string;
  accountTypeVariant: string;
  accountIcon: IconName | null;
  accountTypeColorKey: string;
  isDeleted: boolean;
  currencyCode: string;
  balanceText: string;
  transactionCountText: string;
  headerActions: {
    canRecover: boolean;
    onRecover: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onReconcile: () => void;
    onMerge: () => void;
    canDelete: boolean;
    canMerge: boolean;
  };
  isReconcileModalVisible: boolean;
  setIsReconcileModalVisible: (visible: boolean) => void;
  onConfirmReconcile: () => void;
  reconciledAt: Date | null;
  onBack: () => void;
  onAuditPress: () => void;
  onAddPress: () => void;
  dateRange: DateRange | null;
  periodFilter: PeriodFilter;
  isDatePickerVisible: boolean;
  showDatePicker: () => void;
  hideDatePicker: () => void;
  navigatePrevious?: () => void;
  navigateNext?: () => void;
  onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  chartData: { x: number; y: number }[];
  rollingAverageData: { x: number; y: number }[];
  xTicks: number[];
  periodMetrics: PeriodMetrics;
  periodMetricsFormatted: {
    totalIncreaseText: string;
    totalDecreaseText: string;
    netChangeText: string;
    dailyAverageText: string | null;
    isLoading: boolean;
  };
  transactionsLoading: boolean;
  transactionsLoadingMore: boolean;
  transactionItems: TransactionListItem[];
  onLoadMore?: () => void;
  secondaryBalances: { currencyCode: string; amountText: string }[];
  isParent: boolean;
  subAccountCount: number;
  subAccounts: SubAccountViewModel[];
  subAccountsLoading: boolean;
  isSubAccountsModalVisible: boolean;
  onShowSubAccounts: () => void;
  onHideSubAccounts: () => void;
  unreconciledCount: number;
  unreconciledAmountText: string;
  selectedIds: Set<TransactionId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: TransactionId) => void;
  toggleSelection: (id: TransactionId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<TransactionId>>>;
  isMergeModalVisible: boolean;
  setIsMergeModalVisible: (visible: boolean) => void;
  mergeCandidates: (Account | PlainAccount)[];
  onConfirmMerge: (targetAccountId: AccountId) => void;
}

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
    hidePicker: hideDatePicker,
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

  const account = useMemo(
    () =>
      dbAccount ||
      ((pName
        ? {
            id: accountId,
            name: pName,
            accountType: pType || 'ASSET',
            currencyCode: pCurrency || workplaceCurrency,
            icon: pIcon || getAccountFallbackIcon(pType),
            colorKey: pColor,
            deletedAt: null,
          }
        : null) as Account | null),
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
  const isParent = useMemo(
    () => accounts.some(a => a.parentAccountId === accountId && a.deletedAt === null),
    [accounts, accountId],
  );
  const subAccountCount = useMemo(
    () => accounts.filter(a => a.parentAccountId === accountId && a.deletedAt === null).length,
    [accounts, accountId],
  );

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

  const secondaryBalances = useMemo(() => {
    if (!balanceData?.childBalances) return [];
    return balanceData.childBalances.map((cb: { currencyCode: string; balance: number }) => ({
      currencyCode: cb.currencyCode,
      amountText: CurrencyFormatter.format(cb.balance, cb.currencyCode),
    }));
  }, [balanceData]);

  // --- Metrics & Precisions ---
  const { precision } = useCurrencyPrecision(balanceCurrency);
  const { data: periodMetricsResult, isLoading: metricsLoading } = useObservable<PeriodMetrics>(
    () => {
      if (!dateRange || !accountId || !accountType) {
        return of({
          totalIncrease: 0,
          totalDecrease: 0,
          netChange: 0,
          dailyAverage: null,
          isLoading: false,
        });
      }
      return transactionRawRepository
        .observeAccountPeriodMetricsRaw(
          workplaceId,
          accountId,
          dateRange.startDate,
          dateRange.endDate,
          isAssetOrExpense,
        )
        .pipe(
          map(metrics => {
            const netChange = metrics.totalIncrease - metrics.totalDecrease;
            const ds = new Date(dateRange.startDate);
            const de = new Date(dateRange.endDate);
            const days = Math.max(
              1,
              Math.ceil((de.getTime() - ds.getTime()) / AppConfig.time.msPerDay),
            );
            return {
              ...metrics,
              netChange,
              dailyAverage: netChange / days,
              isLoading: false,
            };
          }),
        );
    },
    [accountId, dateRange, accountType, isAssetOrExpense, workplaceId],
    { totalIncrease: 0, totalDecrease: 0, netChange: 0, dailyAverage: null, isLoading: true },
  );

  const periodMetrics = useMemo(
    () => ({
      ...periodMetricsResult,
      isLoading: metricsLoading || periodMetricsResult.isLoading,
    }),
    [periodMetricsResult, metricsLoading],
  );

  const periodMetricsFormatted = useMemo(
    () => ({
      totalIncreaseText: CurrencyFormatter.format(periodMetrics.totalIncrease, balanceCurrency),
      totalDecreaseText: CurrencyFormatter.format(periodMetrics.totalDecrease, balanceCurrency),
      netChangeText: CurrencyFormatter.format(periodMetrics.netChange, balanceCurrency),
      dailyAverageText:
        periodMetrics.dailyAverage !== null
          ? CurrencyFormatter.format(periodMetrics.dailyAverage, balanceCurrency)
          : null,
      isLoading: periodMetrics.isLoading,
    }),
    [periodMetrics, balanceCurrency],
  );

  // --- Sub Accounts Logic ---
  const [isSubAccountsModalVisible, setIsSubAccountsModalVisible] = useState(false);
  const subBalances = useMemo(
    () =>
      new Map<string, AccountBalance>(rawSubBalances.map((b: AccountBalance) => [b.accountId, b])),
    [rawSubBalances],
  );

  const descendants = useMemo(() => {
    if (!account || !accounts.length) return [];
    const buildSubTree = (
      parentId: string,
      level: number,
    ): { account: Account | PlainAccount; level: number }[] => {
      const result: { account: Account | PlainAccount; level: number }[] = [];
      const children = accounts
        .filter(a => a.parentAccountId === parentId && a.deletedAt === null)
        .sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0));
      for (const child of children) {
        result.push({ account: child, level });
        result.push(...buildSubTree(child.id, level + 1));
      }
      return result;
    };
    return buildSubTree(accountId, 0);
  }, [account, accounts, accountId]);

  const { theme } = useTheme();
  const subAccounts = useMemo(() => {
    return descendants.map(({ account: child, level }) => {
      const subBalance = subBalances.get(child.id);
      const color = theme[getAccountTypeColorKey(child.accountType)];
      const isGroup = accounts.some(a => a.parentAccountId === child.id && a.deletedAt === null);
      return {
        id: child.id,
        name: child.name,
        icon: getAccountIcon(child),
        balanceText: CurrencyFormatter.format(
          subBalance?.balance ?? 0,
          subBalance?.currencyCode || child.currencyCode || workplaceCurrency,
        ),
        color,
        level,
        isGroup,
      };
    });
  }, [descendants, subBalances, workplaceCurrency, theme, accounts]);

  // --- Handlers ---
  const onDelete = useCallback(() => {
    if (!account) return;
    confirm.show({
      title: 'Delete Account',
      message:
        transactionCount > 0
          ? `This account has ${transactionCount} transaction(s). Deleting it will orphan these transactions. Are you sure?`
          : 'Are you sure you want to delete this account? This action cannot be undone.',
      destructive: true,
      requiredConfirmationValue: account.name,
      onConfirm: async () => {
        try {
          await deleteAccount(account as Account);
          toast.success('Account has been deleted.', {
            action: {
              label: 'Undo',
              onPress: async () => {
                try {
                  await recoverAction(accountId);
                  toast.success('Account restored.');
                } catch (err) {
                  logger.error('Failed to undo deletion:', err);
                  showErrorAlert('Could not restore account');
                }
              },
            },
          });
          AppNavigation.toAccounts();
        } catch (error) {
          logger.error('Failed to delete account:', error);
          showErrorAlert(
            `Could not delete account: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }
      },
    });
  }, [account, deleteAccount, transactionCount, accountId, recoverAction]);

  const onRecover = useCallback(() => {
    showConfirmationAlert(
      'Recover Account',
      'This will restore the deleted account. Continue?',
      async () => {
        try {
          await recoverAction(accountId);
          toast.success('Account has been restored.');
          AppNavigation.replaceToAccountDetails(accountId);
        } catch (error) {
          logger.error('Failed to recover account:', error);
          showErrorAlert(
            `Could not recover account: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }
      },
    );
  }, [accountId, recoverAction]);

  const [isReconcileModalVisible, setIsReconcileModalVisible] = useState(false);

  const onReconcile = useCallback(() => {
    setIsReconcileModalVisible(true);
  }, []);
  const onConfirmReconcile = async () => {
    setIsReconcileModalVisible(false);
    try {
      await reconcileAccount(accountId, new Date());
      toast.success(AppConfig.strings.accounts.reconciliation.alert.successMessage);
    } catch (error) {
      logger.error('Failed to reconcile account:', error);
      showErrorAlert(
        `Could not reconcile account: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  };

  const [isMergeModalVisible, setIsMergeModalVisible] = useState(false);
  const mergeCandidates = useMemo(() => {
    if (!account) return [];
    return accounts.filter(
      a =>
        a.id !== accountId &&
        a.accountType === account.accountType &&
        a.accountSubtype === account.accountSubtype &&
        a.currencyCode === account.currencyCode &&
        a.deletedAt === null,
    );
  }, [account, accounts, accountId]);

  const onMerge = useCallback(() => {
    if (mergeCandidates.length === 0) {
      toast.info('No eligible accounts found to merge into.');
      return;
    }
    setIsMergeModalVisible(true);
  }, [mergeCandidates.length]);

  const onConfirmMerge = useCallback(
    async (targetAccountId: AccountId) => {
      const target = accounts.find(a => a.id === targetAccountId);
      if (!target || !account) return;

      setIsMergeModalVisible(false);

      confirm.show({
        title: 'Merge Accounts',
        message: `This account has transactions and cannot be deleted directly. Merging will move ALL transactions, planned payments, and rules from "${account.name}" into "${target.name}", and then delete "${account.name}". This action is permanent.`,
        destructive: true,
        requiredConfirmationValue: account.name,
        onConfirm: async () => {
          try {
            await mergeAccounts(targetAccountId, [accountId]);
            toast.success(`Successfully merged into ${target.name}`);
            AppNavigation.toAccounts();
          } catch (error) {
            logger.error('Failed to merge accounts:', error);
            showErrorAlert(
              `Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        },
      });
    },
    [account, accountId, accounts, mergeAccounts],
  );

  const onEdit = useCallback(() => {
    if (!account) return;
    const isCategory = account.accountType === 'INCOME' || account.accountType === 'EXPENSE';
    if (isCategory) {
      AppNavigation.toCategoryForm(accountId, {
        name: account.name,
        type: account.accountType,
        currency: account.currencyCode,
        icon: getAccountIcon(account),
      });
    } else {
      AppNavigation.toAccountForm(accountId, {
        name: account.name,
        type: account.accountType,
        currency: account.currencyCode,
        icon: getAccountIcon(account),
      });
    }
  }, [accountId, account]);

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
      hideDatePicker();
    },
    [hideDatePicker, setFilter],
  );

  // --- Transaction List Grouping ---
  const transactionGroupingOptions = useMemo(
    () => ({
      items: transactions,
      getDate: (t: DisplayTransaction) => t.transactionDate,
      sortByDate: 'desc' as const,
      getStats: (txnsForDay: DisplayTransaction[]) => {
        let netAmount = 0;
        txnsForDay.forEach(t => {
          netAmount = t.isIncrease
            ? safeAdd(netAmount, t.amount, precision)
            : safeSubtract(netAmount, t.amount, precision);
        });
        return { count: txnsForDay.length, netAmount, currencyCode: balanceCurrency };
      },
      renderItem: (transaction: DisplayTransaction & { counterAccounts?: any[] }) => {
        const displayAccounts = [] as any[];
        if (transaction.counterAccounts && transaction.counterAccounts.length > 0) {
          const visibleCount =
            transaction.counterAccounts.length > 2 ? 1 : transaction.counterAccounts.length;
          for (let i = 0; i < visibleCount; i++) {
            const acc = transaction.counterAccounts[i];
            displayAccounts.push({
              id: acc.id,
              name: acc.name,
              accountType: acc.accountType,
              icon: acc.icon,
            });
          }
          if (transaction.counterAccounts.length > visibleCount) {
            displayAccounts.push({
              id: 'more',
              name: `+${transaction.counterAccounts.length - visibleCount} more`,
              accountType: 'NEUTRAL',
              icon: 'list',
            });
          }
        } else {
          const fallbackAcc = transaction.counterAccountType
            ? {
                id: 'counter',
                name: transaction.counterAccountName || transaction.counterAccountType,
                accountType: transaction.counterAccountType,
                icon: transaction.counterAccountIcon,
              }
            : {
                id: transaction.accountId,
                name: transaction.accountName || 'Unknown',
                accountType: transaction.accountType || 'ASSET',
                icon: transaction.icon,
              };
          displayAccounts.push(fallbackAcc);
        }

        const base = journalPresenter.getPresentation(
          transaction.displayType as JournalDisplayType,
          transaction.semanticLabel,
        );
        return {
          id: transaction.id,
          type: 'transaction' as const,
          date: transaction.transactionDate,
          onPress: () => onTransactionPress(transaction),
          cardProps: {
            title: transaction.journalDescription || transaction.displayTitle || 'Transaction',
            amount: transaction.amount,
            currencyCode: transaction.currencyCode,
            transactionDate: transaction.transactionDate,
            presentation: {
              label: base.label,
              typeColor: base.colorKey,
              typeIcon: (transaction.isIncrease ? 'arrowUp' : 'arrowDown') as IconName,
              amountPrefix: transaction.isIncrease ? '+ ' : '− ',
            },
            badges: displayAccounts.map(acc => ({
              text: acc.name,
              variant: getAccountTypeVariant(acc.accountType),
              icon: acc.icon,
              fallbackIcon: getAccountFallbackIcon(acc.accountType),
            })),
            notes: transaction.notes,
          },
        };
      },
    }),
    [transactions, balanceCurrency, onTransactionPress, precision],
  );

  const { groupedItems: rawGroupedItems } = useTransactionGrouping(transactionGroupingOptions);

  const transactionItems = useMemo(() => {
    if (!reconciledAt || !rawGroupedItems.length) return rawGroupedItems;
    const result: TransactionListItem[] = [];
    let markerAdded = false;
    const reconTime = reconciledAt.getTime();
    for (const item of rawGroupedItems) {
      let itemToPush = item;
      if (!markerAdded) {
        if (item.type === 'transaction' && item.date && item.date <= reconTime) {
          result.push({
            id: 'reconciled-separator',
            type: 'separator' as any,
            date: reconTime,
            isReconciledMarker: true,
          } as any);
          markerAdded = true;
        } else if (item.type === 'separator') {
          const startOfDay = item.date;
          const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
          if (reconTime >= startOfDay) {
            itemToPush = { ...item, reconciledAt: reconTime } as any;
            if (reconTime <= endOfDay || item.isCollapsed) markerAdded = true;
            if (!item.isCollapsed && reconTime > endOfDay) {
              result.push({
                id: 'reconciled-separator',
                type: 'separator' as any,
                date: reconTime,
                isReconciledMarker: true,
              } as any);
              markerAdded = true;
            }
          }
        }
      }
      result.push(itemToPush);
    }
    return result;
  }, [rawGroupedItems, reconciledAt]);

  // --- Selection Actions ---
  const onShareSelected = async () => {
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
          title: `Transactions for ${account?.name || 'Account'}`,
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
  };

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

  // --- Charts Logic ---
  const { data: chartTransactions } = useObservable<Transaction[]>(
    () => {
      if (!accountId) return of([]);
      const MS_PER_DAY = AppConfig.time.msPerDay;
      const start =
        (dateRange ? dateRange.startDate : dayjs().startOf('month').valueOf()) - 7 * MS_PER_DAY;
      const end =
        (dateRange ? dateRange.endDate : dayjs().endOf('month').valueOf()) + 7 * MS_PER_DAY;
      return transactionRepository
        .transactionsQuery(
          Q.where('workplace_id', workplaceId),
          Q.where('account_id', accountId),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('transaction_date', Q.gte(start)),
          Q.where('transaction_date', Q.lte(end)),
          Q.sortBy('transaction_date', Q.asc),
        )
        .observeWithColumns(['running_balance', 'transaction_date']);
    },
    [workplaceId, accountId, dateRange],
    [],
  );

  const { chartData, rollingAverageData, xTicks } = useMemo(() => {
    if (!chartTransactions || !chartTransactions.length)
      return { chartData: [], rollingAverageData: [], xTicks: [] };

    // Process points into a flat series
    const firstWithBalance = chartTransactions.find(
      t => t.runningBalance !== undefined && t.runningBalance !== null,
    );
    const pts = chartTransactions.reduce(
      (acc, t: Transaction) => {
        const lastBal =
          acc.length > 0 ? acc[acc.length - 1].y : firstWithBalance?.runningBalance || 0;
        const y =
          t.runningBalance !== undefined && t.runningBalance !== null ? t.runningBalance : lastBal;
        acc.push({ x: t.transactionDate, y });
        return acc;
      },
      [] as { x: number; y: number }[],
    );

    const MS_PER_DAY = AppConfig.time.msPerDay;
    const visibleStart = dateRange ? dateRange.startDate : pts[0].x;
    const visibleEnd = dateRange ? dateRange.endDate : pts[pts.length - 1].x;
    const effectiveMaxX = visibleEnd + 7 * MS_PER_DAY;

    // Ticks
    const ticks: number[] = [];
    const numTicks = 4;
    const range = effectiveMaxX - visibleStart;
    const step = range / (numTicks - 1);
    for (let i = 0; i < numTicks; i++) ticks.push(visibleStart + step * i);

    // Full series generation
    const dailyBalances: { x: number; y: number }[] = [];
    let currentDayStart = new Date(pts[0].x).setHours(0, 0, 0, 0);
    const lastDayEnd = new Date(effectiveMaxX).setHours(23, 59, 59, 999);
    let lb = pts[0].y;
    let pi = 0;
    while (currentDayStart <= lastDayEnd) {
      const nds = currentDayStart + MS_PER_DAY;
      while (pi < pts.length && pts[pi].x < nds) {
        lb = pts[pi].y;
        pi++;
      }
      dailyBalances.push({ x: currentDayStart, y: lb });
      currentDayStart = nds;
    }

    const fullRolling = dailyBalances.map((db, i) => {
      let sum = 0,
        count = 0;
      for (let j = 0; j < 7; j++) {
        if (i - j >= 0) {
          sum += dailyBalances[i - j].y;
          count++;
        }
      }
      return { x: db.x, y: count > 0 ? sum / count : 0 };
    });

    return {
      chartData: dailyBalances.filter(p => p.x >= visibleStart && p.x <= effectiveMaxX),
      rollingAverageData: fullRolling.filter(p => p.x >= visibleStart && p.x <= effectiveMaxX),
      xTicks: ticks,
    };
  }, [chartTransactions, dateRange]);

  // --- Return VM ---
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
    headerActions: {
      canRecover: isDeleted,
      onRecover,
      onEdit,
      onDelete,
      onReconcile,
      onMerge,
      canDelete: !isDeleted && transactionCount === 0,
      canMerge: !isDeleted && transactionCount > 0,
    },
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
    isParent: !!isParent,
    subAccountCount: subAccountCount || 0,
    subAccounts,
    subAccountsLoading: dashboardLoading,
    isSubAccountsModalVisible,
    onShowSubAccounts: useCallback(() => setIsSubAccountsModalVisible(true), []),
    onHideSubAccounts: useCallback(() => setIsSubAccountsModalVisible(false), []),
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
