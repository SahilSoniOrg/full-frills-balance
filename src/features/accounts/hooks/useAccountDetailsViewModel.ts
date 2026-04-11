import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import Account, { formatAccountSubtypeLabel } from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useAccountActions, useAccountDashboard } from '@/src/features/accounts/hooks/useAccounts';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { useObservable } from '@/src/hooks/useObservable';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { useLedgerTransactionsForAccount } from '@/src/services/ledger';
import { AccountBalance, DisplayTransaction, JournalDisplayType } from '@/src/types/domain';
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
import { useCallback, useMemo, useState } from 'react';
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
  accountId: string;
  accountLoading: boolean;
  accountMissing: boolean;
  accountName: string;
  accountType: string;
  accountSubtypeLabel: string;
  accountTypeVariant: string;
  accountIcon: IconName | null;
  accountTypeColorKey: string;
  isDeleted: boolean;
  balanceText: string;
  transactionCountText: string;
  headerActions: {
    canRecover: boolean;
    onRecover: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onReconcile: () => void;
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
}

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
  const { defaultCurrency } = useUI();
  const params = useLocalSearchParams();
  const accountId = params.accountId as string;
  const startDateParam = params.startDate as string;
  const endDateParam = params.endDate as string;

  const initialDateRange = useMemo(() => {
    if (startDateParam && endDateParam) {
      const parsedStartDate = Number.parseInt(startDateParam, 10);
      const parsedEndDate = Number.parseInt(endDateParam, 10);
      if (!Number.isFinite(parsedStartDate) || !Number.isFinite(parsedEndDate)) {
        return null;
      }
      return {
        startDate: parsedStartDate,
        endDate: parsedEndDate,
      };
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

  const {
    account: dbAccount,
    balanceData: dbBalanceData,
    subAccounts: rawSubBalances,
    allAccounts: accounts,
    isLoading: dashboardLoading,
  } = useAccountDashboard(accountId);

  // Initial Data Injection: Extract preview data from params
  const pName = params.pName as string;
  const pBalance = params.pBalance as string;
  const pCurrency = params.pCurrency as string;
  const pIcon = params.pIcon as string;
  const pType = params.pType as string;
  const pColor = params.pColor as string;

  const account = useMemo(
    () =>
      dbAccount ||
      ((pName
        ? {
            id: accountId,
            name: pName,
            accountType: pType || 'ASSET',
            currencyCode: pCurrency || defaultCurrency || 'USD',
            icon: pIcon || 'wallet',
            colorKey: pColor,
            deletedAt: null,
          }
        : null) as Account | null),
    [dbAccount, pName, accountId, pType, pCurrency, defaultCurrency, pIcon, pColor],
  );

  const balanceData = useMemo(
    () =>
      dbBalanceData ||
      ((pBalance
        ? {
            accountId,
            balance: parseFloat(pBalance),
            currencyCode: pCurrency || account?.currencyCode || defaultCurrency || 'USD',
            transactionCount: 0,
          }
        : null) as AccountBalance | null),
    [dbBalanceData, pBalance, accountId, pCurrency, account?.currencyCode, defaultCurrency],
  );

  // Perceived loading state: if we have preview metadata, we can show the header immediately
  const accountLoading = dashboardLoading && !pName;

  const isParent = useMemo(
    () => accounts.some((a: Account) => a.parentAccountId === accountId && a.deletedAt === null),
    [accounts, accountId],
  );
  const subAccountCount = useMemo(
    () =>
      accounts.filter((a: Account) => a.parentAccountId === accountId && a.deletedAt === null)
        .length,
    [accounts, accountId],
  );

  const {
    transactions,
    isLoading: transactionsLoading,
    isLoadingMore: transactionsLoadingMore,
    hasMore,
    loadMore,
  } = useLedgerTransactionsForAccount(
    accountId,
    AppConfig.defaults.journalPageSize,
    dateRange || undefined,
  );
  const { deleteAccount, recoverAccount: recoverAction, reconcileAccount } = useAccountActions();

  // Chart-specific unpaginated transactions
  const { data: chartTransactions } = useObservable<Transaction[]>(
    () => {
      if (!accountId) return of([]);
      const MS_PER_DAY = AppConfig.time.msPerDay;
      // Pad 7 days before and after
      const start = dateRange
        ? dateRange.startDate - 7 * MS_PER_DAY
        : dayjs().startOf('month').valueOf() - 7 * MS_PER_DAY;
      const end = dateRange
        ? dateRange.endDate + 7 * MS_PER_DAY
        : dayjs().endOf('month').valueOf() + 7 * MS_PER_DAY;

      return transactionRepository
        .transactionsQuery(
          Q.where('account_id', accountId),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('transaction_date', Q.gte(start)),
          Q.where('transaction_date', Q.lte(end)),
          Q.sortBy('transaction_date', Q.asc),
        )
        .observeWithColumns(['running_balance', 'transaction_date']);
    },
    [accountId, dateRange],
    [],
  );

  const [isSubAccountsModalVisible, setIsSubAccountsModalVisible] = useState(false);
  const [isReconcileModalVisible, setIsReconcileModalVisible] = useState(false);

  // Build recursive sub-tree from all accounts
  const descendants = useMemo(() => {
    if (!account || !accounts.length) return [];

    const buildSubTree = (
      parentId: string,
      level: number,
    ): { account: Account; level: number }[] => {
      const result: { account: Account; level: number }[] = [];
      const childrenForParent = accounts
        .filter((a: Account) => a.parentAccountId === parentId && a.deletedAt === null)
        .sort((a: Account, b: Account) => (a.orderNum || 0) - (b.orderNum || 0));

      for (const child of childrenForParent) {
        result.push({ account: child, level });
        result.push(...buildSubTree(child.id, level + 1));
      }
      return result;
    };

    return buildSubTree(accountId, 0);
  }, [account, accounts, accountId]);

  const accountType = account?.accountType || '';

  const isAssetOrExpense = accountType === 'ASSET' || accountType === 'EXPENSE';

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
            const dailyAverage = netChange / days;

            return {
              ...metrics,
              netChange,
              dailyAverage,
              isLoading: false,
            };
          }),
        );
    },
    [accountId, dateRange, accountType],
    {
      totalIncrease: 0,
      totalDecrease: 0,
      netChange: 0,
      dailyAverage: null,
      isLoading: true,
    },
  );

  const periodMetrics = useMemo(
    () => ({
      ...periodMetricsResult,
      isLoading: metricsLoading || periodMetricsResult.isLoading,
    }),
    [periodMetricsResult, metricsLoading],
  );

  const subBalances = useMemo(
    () =>
      new Map<string, AccountBalance>(rawSubBalances.map((b: AccountBalance) => [b.accountId, b])),
    [rawSubBalances],
  );
  const subBalancesLoading = dashboardLoading;
  const balanceLoading = dashboardLoading;
  const balance = dbBalanceData?.balance || 0;
  const transactionCount = balanceData?.transactionCount || 0;
  const isDeleted = account?.deletedAt != null;

  const onDelete = useCallback(() => {
    if (!account) return;
    const hasTransactions = transactionCount > 0;
    const message = hasTransactions
      ? `This account has ${transactionCount} transaction(s). Deleting it will orphan these transactions. Are you sure?`
      : 'Are you sure you want to delete this account? This action cannot be undone.';

    confirm.show({
      title: 'Delete Account',
      message,
      destructive: true,
      requiredConfirmationValue: account.name,
      onConfirm: async () => {
        try {
          await deleteAccount(account);
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
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not delete account: ${errorMessage}`);
        }
      },
    });
  }, [account, deleteAccount, transactionCount]);

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
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not recover account: ${errorMessage}`);
        }
      },
    );
  }, [accountId, recoverAction]);

  const onReconcile = useCallback(() => {
    setIsReconcileModalVisible(true);
  }, []);

  const onConfirmReconcile = useCallback(async () => {
    setIsReconcileModalVisible(false);
    try {
      await reconcileAccount(accountId, new Date());
      toast.success(AppConfig.strings.accounts.reconciliation.alert.successMessage);
    } catch (error) {
      logger.error('Failed to reconcile account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showErrorAlert(`Could not reconcile account: ${errorMessage}`);
    }
  }, [accountId, reconcileAccount]);

  const onEdit = useCallback(() => {
    AppNavigation.toAccountForm(
      accountId,
      account
        ? {
            name: account.name,
            type: account.accountType,
            currency: account.currencyCode,
            icon: account.icon || 'wallet',
          }
        : undefined,
    );
  }, [accountId, account]);

  const onBack = useCallback(() => {
    AppNavigation.back();
  }, []);

  const onAuditPress = useCallback(() => {
    AppNavigation.toAuditLog({ entityType: 'account', entityId: accountId });
  }, [accountId]);

  const onTransactionPress = useCallback((transaction: DisplayTransaction) => {
    if (transaction.journalId) {
      const isIncrease = transaction.isIncrease;
      const displayType = transaction.displayType as JournalDisplayType;
      const base = journalPresenter.getPresentation(displayType, transaction.semanticLabel);

      AppNavigation.toTransactionDetails(transaction.journalId, {
        title: transaction.journalDescription || transaction.displayTitle || 'Transaction',
        amount: transaction.amount,
        currencyCode: transaction.currencyCode,
        date: transaction.transactionDate,
        typeColor: base.colorKey,
        typeIcon: isIncrease ? 'arrowUp' : 'arrowDown',
        displayType: transaction.displayType,
      });
    }
  }, []);

  const onAddPress = useCallback(() => {
    AppNavigation.toJournalEntry({ sourceAccountId: accountId });
  }, [accountId]);

  const onDateSelect = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      setFilter(range, filter);
      hideDatePicker();
    },
    [hideDatePicker, setFilter],
  );

  const accountSubtypeLabel = account?.accountSubtype
    ? formatAccountSubtypeLabel(account.accountSubtype)
    : '';
  const accountTypeVariant = getAccountTypeVariant(accountType);
  const accountTypeColorKey = getAccountTypeColorKey(accountType);

  const balanceCurrency = balanceData?.currencyCode || account?.currencyCode || defaultCurrency;

  const balanceText = balanceLoading
    ? '...'
    : account
      ? CurrencyFormatter.format(balance, balanceCurrency)
      : '...';

  const periodMetricsFormatted = useMemo(() => {
    return {
      totalIncreaseText: CurrencyFormatter.format(periodMetrics.totalIncrease, balanceCurrency),
      totalDecreaseText: CurrencyFormatter.format(periodMetrics.totalDecrease, balanceCurrency),
      netChangeText: CurrencyFormatter.format(periodMetrics.netChange, balanceCurrency),
      dailyAverageText:
        periodMetrics.dailyAverage !== null
          ? CurrencyFormatter.format(periodMetrics.dailyAverage, balanceCurrency)
          : null,
      isLoading: periodMetrics.isLoading,
    };
  }, [periodMetrics, balanceCurrency]);

  const secondaryBalances = useMemo(() => {
    if (!balanceData?.childBalances) return [];
    return balanceData.childBalances.map((cb: { currencyCode: string; balance: number }) => ({
      currencyCode: cb.currencyCode,
      amountText: CurrencyFormatter.format(cb.balance, cb.currencyCode),
    }));
  }, [balanceData]);

  const transactionCountText = balanceLoading ? '...' : String(transactionCount);

  const { theme } = useTheme();

  const subAccounts = useMemo(() => {
    return descendants.map(({ account: child, level }) => {
      const subBalance = subBalances.get(child.id);
      const balanceVal = subBalance?.balance ?? 0;
      const currency = subBalance?.currencyCode || child.currencyCode || defaultCurrency;

      const color = theme[getAccountTypeColorKey(child.accountType)];

      const isGroup = accounts.some(a => a.parentAccountId === child.id && a.deletedAt === null);

      return {
        id: child.id,
        name: child.name,
        icon: child.icon || 'wallet',
        balanceText: CurrencyFormatter.format(balanceVal, currency),
        color,
        level,
        isGroup,
      };
    });
  }, [descendants, subBalances, defaultCurrency, theme, accounts]);

  const onShowSubAccounts = useCallback(() => setIsSubAccountsModalVisible(true), []);
  const onHideSubAccounts = useCallback(() => setIsSubAccountsModalVisible(false), []);

  const { precision } = useCurrencyPrecision(balanceCurrency);

  const transactionGroupingOptions = useMemo(
    () => ({
      items: transactions,
      getDate: (t: DisplayTransaction) => t.transactionDate,
      sortByDate: 'desc' as const,
      getStats: (txnsForDay: DisplayTransaction[]) => {
        let netAmount = 0;
        txnsForDay.forEach(t => {
          if (t.isIncrease) {
            netAmount = safeAdd(netAmount, t.amount, precision);
          } else {
            netAmount = safeSubtract(netAmount, t.amount, precision);
          }
        });
        return {
          count: txnsForDay.length,
          netAmount,
          currencyCode: balanceCurrency,
        };
      },
      renderItem: (transaction: DisplayTransaction & { counterAccounts?: any[] }) => {
        const displayAccounts = [] as any[];

        if (transaction.counterAccounts && transaction.counterAccounts.length > 0) {
          // Show up to 2 counter accounts, or 1 + "+X more"
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
        } else if (transaction.counterAccountType) {
          // Fallback for singular counter account
          displayAccounts.push({
            id: 'counter',
            name: transaction.counterAccountName || transaction.counterAccountType,
            accountType: transaction.counterAccountType,
            icon: transaction.counterAccountIcon,
          });
        } else {
          // Last fallback: show current account if no counter-party found (e.g. adjustment)
          displayAccounts.push({
            id: transaction.accountId,
            name: transaction.accountName || 'Unknown',
            accountType: transaction.accountType || 'ASSET',
            icon: transaction.icon,
          });
        }

        const displayType = transaction.displayType as JournalDisplayType;
        const base = journalPresenter.getPresentation(displayType, transaction.semanticLabel);
        const isIncrease = transaction.isIncrease;

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
              typeIcon: (isIncrease ? 'arrowUp' : 'arrowDown') as IconName,
              amountPrefix: isIncrease ? '+ ' : '− ',
            },
            badges: displayAccounts.map(acc => ({
              text: acc.name,
              variant: getAccountTypeVariant(acc.accountType),
              icon: acc.icon,
              fallbackIcon: (acc.accountType === 'EXPENSE' ? 'tag' : 'wallet') as IconName,
            })),
            notes: transaction.notes,
          },
        };
      },
    }),
    [transactions, balanceCurrency, onTransactionPress, precision],
  );

  const reconciledAt = account?.reconciledAt || null;

  const { groupedItems: rawGroupedItems } = useTransactionGrouping(transactionGroupingOptions);

  const { data: unreconciledMetrics } = useObservable<{ count: number; total: number }>(
    () => {
      if (!accountId) return of({ count: 0, total: 0 });
      return transactionRawRepository.observeUnreconciledMetricsRaw(
        accountId,
        reconciledAt?.getTime() || null,
        isAssetOrExpense,
      );
    },
    [accountId, reconciledAt, isAssetOrExpense],
    { count: 0, total: 0 },
  );

  const transactionItems = useMemo(() => {
    if (!reconciledAt || !rawGroupedItems.length) return rawGroupedItems;

    const result: TransactionListItem[] = [];
    let markerAdded = false;
    const reconTime = reconciledAt.getTime();

    for (let i = 0; i < rawGroupedItems.length; i++) {
      const item = rawGroupedItems[i];
      let itemToPush = item;

      if (!markerAdded) {
        if (item.type === 'transaction') {
          if (item.date && item.date <= reconTime) {
            result.push({
              id: 'reconciled-separator',
              type: 'separator' as any,
              date: reconTime,
              isReconciledMarker: true,
            } as any);
            markerAdded = true;
          }
        } else if (item.type === 'separator') {
          const startOfDay = item.date;
          const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;

          if (reconTime >= startOfDay) {
            if (reconTime <= endOfDay) {
              // Inside or exactly at day start; attach indicator and swallow if collapsed
              itemToPush = { ...item, reconciledAt: reconTime } as any;
              if (item.isCollapsed) {
                markerAdded = true;
              }
            } else {
              // Recon time is in the future relative to this entire day.
              // Since we are going DESC, the marker belongs ABOVE this day.
              if (item.isCollapsed) {
                // For a better UX in collapsed view, if the day is fully reconciled,
                // show the status on the header and swallow the marker line.
                itemToPush = { ...item, reconciledAt: reconTime } as any;
                markerAdded = true;
              } else {
                // If expanded, showing a separate divider before the day makes the boundary clear.
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
      }
      result.push(itemToPush);
    }

    if (!markerAdded) {
      const lastItem = rawGroupedItems[rawGroupedItems.length - 1];
      if (lastItem && lastItem.date && lastItem.date <= reconTime) {
        result.push({
          id: 'reconciled-separator',
          type: 'separator' as any,
          date: reconTime,
          isReconciledMarker: true,
        } as any);
      }
    }

    return result;
  }, [rawGroupedItems, reconciledAt]);

  const { chartData, rollingAverageData, xTicks } = useMemo(() => {
    if (!chartTransactions || !chartTransactions.length)
      return { chartData: [], rollingAverageData: [], xTicks: [] };

    const firstWithBalance = chartTransactions.find(
      t => t.runningBalance !== undefined && t.runningBalance !== null,
    );
    let lastValidBalance = firstWithBalance?.runningBalance || 0;
    const pts = chartTransactions.map((t: Transaction) => {
      if (t.runningBalance !== undefined && t.runningBalance !== null) {
        lastValidBalance = t.runningBalance;
      }
      return {
        x: t.transactionDate,
        y: lastValidBalance,
      };
    });

    const MS_PER_DAY = AppConfig.time.msPerDay;

    // Define visible bounds to match the filtered chart data
    const calcMinX = pts[0].x;
    const calcMaxX = pts[pts.length - 1].x;

    const visibleStart = dateRange ? dateRange.startDate : calcMinX;
    const visibleEnd = dateRange ? dateRange.endDate : calcMaxX;
    const effectiveMaxX = visibleEnd + 7 * MS_PER_DAY; // include 7 day future padding

    // Compute xTicks (e.g., 4 ticks spread across the expected visible range)
    const ticks: number[] = [];
    if (visibleStart !== effectiveMaxX) {
      const numTicks = 4;
      const step = (effectiveMaxX - visibleStart) / (numTicks - 1);
      for (let i = 0; i < numTicks; i++) {
        ticks.push(visibleStart + step * i);
      }
    } else {
      ticks.push(visibleStart);
    }

    const sortedPts = [...pts].sort((a, b) => a.x - b.x);

    // the boundaries for calculation (includes the +/- 7 padding days)
    const calcFirstTime = sortedPts[0].x;
    const calcLastTime = sortedPts[sortedPts.length - 1].x;

    // Daily balances over the entire padded range
    const dailyBalances: { x: number; y: number }[] = [];
    let currentDayStart = new Date(calcFirstTime).setHours(0, 0, 0, 0);

    // Let's extend the logic to fill all the way to `endDate + 7 days` if needed,
    // to naturally project a flat line for the future 7 days.
    const targetEndDay = dateRange
      ? dateRange.endDate + 7 * MS_PER_DAY
      : calcLastTime + 7 * MS_PER_DAY;
    const calcLastDayEnd = new Date(targetEndDay).setHours(23, 59, 59, 999);

    let lastKnownBalance = sortedPts[0].y;
    let ptIndex = 0;

    while (currentDayStart <= calcLastDayEnd) {
      const nextDayStart = currentDayStart + MS_PER_DAY;
      while (ptIndex < sortedPts.length && sortedPts[ptIndex].x < nextDayStart) {
        lastKnownBalance = sortedPts[ptIndex].y;
        ptIndex++;
      }
      dailyBalances.push({
        x: currentDayStart,
        y: lastKnownBalance,
      });
      currentDayStart = nextDayStart;
    }

    // Compute the 7-day trailing average for each day
    const fullRollingAverageData: { x: number; y: number }[] = [];
    for (let i = 0; i < dailyBalances.length; i++) {
      let sum = 0;
      let count = 0;
      // look back up to 7 days
      for (let j = 0; j < 7; j++) {
        if (i - j >= 0) {
          sum += dailyBalances[i - j].y;
          count++;
        }
      }
      fullRollingAverageData.push({
        x: dailyBalances[i].x,
        y: count > 0 ? sum / count : 0,
      });
    }

    // Cut off the padding days to keep graph strictly within the visible range or data bounds
    const visibleChartData = dailyBalances.filter(
      (pt: { x: number; y: number }) => pt.x >= visibleStart && pt.x <= effectiveMaxX,
    );
    // Include the requested "7 days future data" in the rolling average to complete the trailing overlap
    const visibleRollingAvgData = fullRollingAverageData.filter(
      (pt: { x: number; y: number }) => pt.x >= visibleStart && pt.x <= effectiveMaxX,
    );

    return {
      chartData: visibleChartData,
      rollingAverageData: visibleRollingAvgData,
      xTicks: ticks,
    };
  }, [chartTransactions, dateRange]);

  return {
    accountLoading,
    accountMissing: !accountLoading && !account,
    accountName: account?.name || '',
    accountType,
    accountSubtypeLabel,
    accountTypeVariant,
    accountIcon: account?.icon || null,
    accountTypeColorKey,
    isDeleted,
    balanceText,
    transactionCountText,
    headerActions: {
      canRecover: isDeleted,
      onRecover,
      onEdit,
      onDelete,
      onReconcile,
    },
    isReconcileModalVisible,
    setIsReconcileModalVisible,
    onConfirmReconcile,
    reconciledAt,
    onBack,
    onAuditPress,
    onAddPress,
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
    transactionsLoading,
    transactionsLoadingMore,
    transactionItems,
    onLoadMore: hasMore ? loadMore : undefined,
    secondaryBalances,
    isParent: !!isParent,
    subAccountCount: subAccountCount || 0,
    subAccounts,
    subAccountsLoading: balanceLoading || subBalancesLoading,
    isSubAccountsModalVisible,
    onShowSubAccounts,
    onHideSubAccounts,
    accountId,
    periodMetrics,
    periodMetricsFormatted,
    unreconciledCount: unreconciledMetrics.count,
    unreconciledAmountText: CurrencyFormatter.format(unreconciledMetrics.total, balanceCurrency),
  };
}
