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
import { AccountBalance, EnrichedTransaction, JournalDisplayType } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { getAccountTypeColorKey, getAccountTypeVariant } from '@/src/utils/accountCategory';
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { logger } from '@/src/utils/logger';
import { safeAdd, safeSubtract } from '@/src/utils/money';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { of } from 'rxjs';

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
    icon: string;
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
    accountIcon: string | null;
    accountTypeColorKey: string;
    isDeleted: boolean;
    balanceText: string;
    transactionCountText: string;
    headerActions: {
        canRecover: boolean;
        onRecover: () => void;
        onEdit: () => void;
        onDelete: () => void;
    };
    onBack: () => void;
    onAuditPress: () => void;
    onAddPress: () => void;
    showFab: boolean;
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
}

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
    const { defaultCurrency } = useUI();
    const router = useRouter();
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
        initialDateRange
    });

    const {
        account,
        balanceData,
        subAccounts: rawSubBalances,
        allAccounts: accounts,
        isLoading: dashboardLoading
    } = useAccountDashboard(accountId);

    const isParent = useMemo(() => accounts.some((a: Account) => a.parentAccountId === accountId && a.deletedAt === null), [accounts, accountId]);
    const subAccountCount = useMemo(() => accounts.filter((a: Account) => a.parentAccountId === accountId && a.deletedAt === null).length, [accounts, accountId]);

    const { transactions, isLoading: transactionsLoading, isLoadingMore: transactionsLoadingMore, hasMore, loadMore } = useLedgerTransactionsForAccount(
        accountId,
        AppConfig.defaults.journalPageSize,
        dateRange || undefined
    );
    const { deleteAccount, recoverAccount: recoverAction } = useAccountActions();

    // Chart-specific unpaginated transactions
    const { data: chartTransactions } = useObservable<Transaction[]>(
        () => {
            if (!accountId) return of([]);
            const MS_PER_DAY = AppConfig.time.msPerDay;
            // Pad 7 days before and after
            const start = dateRange ? dateRange.startDate - (7 * MS_PER_DAY) : dayjs().startOf('month').valueOf() - (7 * MS_PER_DAY);
            const end = dateRange ? dateRange.endDate + (7 * MS_PER_DAY) : dayjs().endOf('month').valueOf() + (7 * MS_PER_DAY);

            return transactionRepository.transactionsQuery(
                Q.where('account_id', accountId),
                Q.where('deleted_at', Q.eq(null)),
                Q.where('transaction_date', Q.gte(start)),
                Q.where('transaction_date', Q.lte(end)),
                Q.sortBy('transaction_date', Q.asc)
            ).observeWithColumns(['running_balance', 'transaction_date']);
        }, [accountId, dateRange], []);

    const [isSubAccountsModalVisible, setIsSubAccountsModalVisible] = useState(false);

    // Build recursive sub-tree from all accounts
    const descendants = useMemo(() => {
        if (!account || !accounts.length) return [];

        const buildSubTree = (parentId: string, level: number): { account: Account; level: number }[] => {
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

    const [periodMetrics, setPeriodMetrics] = useState<PeriodMetrics>({
        totalIncrease: 0,
        totalDecrease: 0,
        netChange: 0,
        dailyAverage: null,
        isLoading: false,
    });

    useEffect(() => {
        if (!dateRange || !accountId || !accountType) {
            setPeriodMetrics({
                totalIncrease: 0,
                totalDecrease: 0,
                netChange: 0,
                dailyAverage: null,
                isLoading: false,
            });
            return;
        }

        const isAssetOrExpense = accountType === 'ASSET' || accountType === 'EXPENSE';
        let isMounted = true;

        const fetchMetrics = async () => {
            setPeriodMetrics(prev => ({ ...prev, isLoading: true }));
            try {
                const { totalIncrease, totalDecrease } = await transactionRawRepository.getAccountPeriodMetricsRaw(
                    accountId,
                    dateRange.startDate,
                    dateRange.endDate,
                    isAssetOrExpense
                );

                if (!isMounted) return;

                const netChange = totalIncrease - totalDecrease;
                // Calculate difference in days (end of day to start of day)
                const ds = new Date(dateRange.startDate);
                const de = new Date(dateRange.endDate);
                const days = Math.max(1, Math.ceil((de.getTime() - ds.getTime()) / AppConfig.time.msPerDay));
                const dailyAverage = netChange / days;

                setPeriodMetrics({
                    totalIncrease,
                    totalDecrease,
                    netChange,
                    dailyAverage,
                    isLoading: false,
                });
            } catch (error) {
                logger.error('Failed to fetch period metrics', error);
                if (isMounted) {
                    setPeriodMetrics(prev => ({ ...prev, isLoading: false }));
                }
            }
        };

        fetchMetrics();
        return () => { isMounted = false; };
    }, [accountId, dateRange, accountType]);

    const subBalances = useMemo(() => new Map<string, AccountBalance>(rawSubBalances.map((b: AccountBalance) => [b.accountId, b])), [rawSubBalances]);
    const subBalancesLoading = dashboardLoading;
    const accountLoading = dashboardLoading;
    const balanceLoading = dashboardLoading;
    const balance = balanceData?.balance || 0;
    const transactionCount = balanceData?.transactionCount || 0;
    const isDeleted = account?.deletedAt != null;

    const onDelete = useCallback(() => {
        if (!account) return;
        const hasTransactions = transactionCount > 0;
        const message = hasTransactions
            ? `This account has ${transactionCount} transaction(s). Deleting it will orphan these transactions. Are you sure?`
            : 'Are you sure you want to delete this account? This action cannot be undone.';

        showConfirmationAlert(
            'Delete Account',
            message,
            async () => {
                try {
                    await deleteAccount(account);
                    showSuccessAlert('Deleted', 'Account has been deleted.');
                    router.push('/(tabs)/accounts');
                } catch (error) {
                    logger.error('Failed to delete account:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not delete account: ${errorMessage}`);
                }
            }
        );
    }, [account, deleteAccount, router, transactionCount]);

    const onRecover = useCallback(() => {
        showConfirmationAlert(
            'Recover Account',
            'This will restore the deleted account. Continue?',
            async () => {
                try {
                    await recoverAction(accountId);
                    showSuccessAlert('Recovered', 'Account has been restored.');
                    router.replace(`/account-details?accountId=${accountId}`);
                } catch (error) {
                    logger.error('Failed to recover account:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not recover account: ${errorMessage}`);
                }
            }
        );
    }, [accountId, recoverAction, router]);

    const onEdit = useCallback(() => {
        router.push(`/account-creation?accountId=${accountId}`);
    }, [accountId, router]);

    const onBack = useCallback(() => {
        router.back();
    }, [router]);

    const onAuditPress = useCallback(() => {
        router.push(`/audit-log?entityType=account&entityId=${accountId}`);
    }, [accountId, router]);

    const onTransactionPress = useCallback((transaction: EnrichedTransaction) => {
        router.push(`/transaction-details?journalId=${transaction.journalId}`);
    }, [router]);

    const onAddPress = useCallback(() => {
        router.push(`/journal-entry?sourceId=${accountId}`);
    }, [accountId, router]);

    const onDateSelect = useCallback((range: DateRange | null, filter: PeriodFilter) => {
        setFilter(range, filter);
        hideDatePicker();
    }, [hideDatePicker, setFilter]);

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
            dailyAverageText: periodMetrics.dailyAverage !== null ? CurrencyFormatter.format(periodMetrics.dailyAverage, balanceCurrency) : null,
            isLoading: periodMetrics.isLoading,
        };
    }, [periodMetrics, balanceCurrency]);

    const secondaryBalances = useMemo(() => {
        if (!balanceData?.childBalances) return [];
        return balanceData.childBalances.map((cb: { currencyCode: string; balance: number }) => ({
            currencyCode: cb.currencyCode,
            amountText: CurrencyFormatter.format(cb.balance, cb.currencyCode)
        }));
    }, [balanceData]);

    const transactionCountText = balanceLoading
        ? '...'
        : String(transactionCount);

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
                isGroup
            };
        });
    }, [descendants, subBalances, defaultCurrency, theme, accounts]);

    const onShowSubAccounts = useCallback(() => setIsSubAccountsModalVisible(true), []);
    const onHideSubAccounts = useCallback(() => setIsSubAccountsModalVisible(false), []);

    const { precision } = useCurrencyPrecision(balanceCurrency);

    const transactionGroupingOptions = useMemo(() => ({
        items: transactions,
        getDate: (t: EnrichedTransaction) => t.transactionDate,
        sortByDate: 'desc' as const,
        getStats: (txnsForDay: EnrichedTransaction[]) => {
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
        renderItem: (transaction: EnrichedTransaction) => {
            const displayAccounts = [] as any[];

            if (transaction.counterAccountType) {
                displayAccounts.push({
                    id: 'counter',
                    name: transaction.counterAccountName || transaction.counterAccountType,
                    accountType: transaction.counterAccountType,
                    icon: transaction.counterAccountIcon,
                });
            }

            displayAccounts.push({
                id: transaction.accountId,
                name: transaction.accountName || 'Unknown',
                accountType: transaction.accountType || 'ASSET',
                icon: transaction.icon,
            });

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
                        icon: (acc.icon as IconName) || (acc.accountType === 'EXPENSE' ? 'tag' : 'wallet'),
                    })),
                    notes: transaction.notes,
                }
            };
        }
    }), [transactions, balanceCurrency, onTransactionPress, precision]);

    const { groupedItems: transactionItems } = useTransactionGrouping(transactionGroupingOptions);

    const { chartData, rollingAverageData, xTicks } = useMemo(() => {
        if (!chartTransactions || !chartTransactions.length) return { chartData: [], rollingAverageData: [], xTicks: [] };

        let lastValidBalance = chartTransactions[0].runningBalance || 0;
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
        const dailyBalances: { x: number, y: number }[] = [];
        let currentDayStart = new Date(calcFirstTime).setHours(0, 0, 0, 0);

        // Let's extend the logic to fill all the way to `endDate + 7 days` if needed, 
        // to naturally project a flat line for the future 7 days.
        const targetEndDay = dateRange ? dateRange.endDate + (7 * MS_PER_DAY) : calcLastTime + (7 * MS_PER_DAY);
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
                y: lastKnownBalance
            });
            currentDayStart = nextDayStart;
        }

        // Compute the 7-day trailing average for each day
        const fullRollingAverageData: { x: number, y: number }[] = [];
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
        const visibleChartData = dailyBalances.filter((pt: { x: number, y: number }) => pt.x >= visibleStart && pt.x <= effectiveMaxX);
        // Include the requested "7 days future data" in the rolling average to complete the trailing overlap
        const visibleRollingAvgData = fullRollingAverageData.filter((pt: { x: number, y: number }) => pt.x >= visibleStart && pt.x <= effectiveMaxX);

        return { chartData: visibleChartData, rollingAverageData: visibleRollingAvgData, xTicks: ticks };
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
        },
        onBack,
        onAuditPress,
        onAddPress,
        showFab: !isDeleted,
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
    };
}
