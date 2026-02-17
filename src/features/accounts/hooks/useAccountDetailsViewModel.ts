import { TransactionCardProps } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core';
import { useUI } from '@/src/contexts/UIContext';
import Account, { AccountType } from '@/src/data/models/Account';
import { useAccount, useAccountActions, useAccountBalance, useAccountBalances, useAccountHasChildren, useAccounts, useAccountSubAccountCount } from '@/src/features/accounts/hooks/useAccounts';
import { useAccountTransactions } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { EnrichedTransaction, JournalDisplayType } from '@/src/types/domain';
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { logger } from '@/src/utils/logger';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

const ACCOUNT_TYPE_VARIANTS: Record<AccountType, ComponentVariant> = {
    [AccountType.ASSET]: 'asset',
    [AccountType.LIABILITY]: 'liability',
    [AccountType.EQUITY]: 'equity',
    [AccountType.INCOME]: 'income',
    [AccountType.EXPENSE]: 'expense',
};

export interface SubAccountViewModel {
    id: string;
    name: string;
    icon: string;
    balanceText: string;
    color: string;
    level: number;
    isGroup: boolean;
}

export interface TransactionCardItemViewModel {
    id: string;
    cardProps: TransactionCardProps;
    onPress: () => void;
}

export interface AccountDetailsViewModel {
    accountId: string;
    accountLoading: boolean;
    accountMissing: boolean;
    accountName: string;
    accountType: string;
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
    transactionsLoading: boolean;
    transactionItems: TransactionCardItemViewModel[];
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

    const { account, isLoading: accountLoading } = useAccount(accountId);
    const { accounts } = useAccounts();
    const { hasChildren: isParent } = useAccountHasChildren(accountId);
    const { subAccountCount } = useAccountSubAccountCount(accountId);
    const { transactions, isLoading: transactionsLoading } = useAccountTransactions(accountId, 50, dateRange || undefined);
    const { balanceData, isLoading: balanceLoading } = useAccountBalance(accountId);
    const { deleteAccount, recoverAccount: recoverAction } = useAccountActions();

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

    const { balancesByAccountId: subBalances, isLoading: subBalancesLoading } = useAccountBalances(
        useMemo(() => descendants.map(d => d.account), [descendants])
    );
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

    const accountType = account?.accountType || '';
    const typeLower = accountType.toLowerCase();
    const accountTypeColorKey = journalPresenter.getAccountColorKey(accountType);

    const balanceCurrency = balanceData?.currencyCode || account?.currencyCode || defaultCurrency;

    const balanceText = balanceLoading
        ? '...'
        : account
            ? CurrencyFormatter.format(balance, balanceCurrency)
            : '...';

    const secondaryBalances = useMemo(() => {
        if (!balanceData?.childBalances) return [];
        return balanceData.childBalances.map(cb => ({
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

            const colorKey = journalPresenter.getAccountColorKey(child.accountType);
            const color = (theme as any)[colorKey] || theme.text;

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

    const transactionItems = useMemo(() => {
        return transactions.map((transaction: EnrichedTransaction) => {
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
                        variant: ACCOUNT_TYPE_VARIANTS[acc.accountType as AccountType],
                        icon: (acc.icon as IconName) || (acc.accountType === 'EXPENSE' ? 'tag' : 'wallet'),
                    })),
                    notes: transaction.notes,
                }
            };
        });
    }, [onTransactionPress, transactions]);

    return {
        accountLoading,
        accountMissing: !accountLoading && !account,
        accountName: account?.name || '',
        accountType,
        accountTypeVariant: typeLower,
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
        transactionsLoading,
        transactionItems,
        secondaryBalances,
        isParent: !!isParent,
        subAccountCount: subAccountCount || 0,
        subAccounts,
        subAccountsLoading: balanceLoading || subBalancesLoading,
        isSubAccountsModalVisible,
        onShowSubAccounts,
        onHideSubAccounts,
        accountId,
    };
}
