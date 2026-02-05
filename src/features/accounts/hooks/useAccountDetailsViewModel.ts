import { TransactionCardProps } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core';
import { useAccount, useAccountActions, useAccountBalance } from '@/src/features/accounts/hooks/useAccounts';
import { useAccountTransactions } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { EnrichedTransaction, JournalDisplayType } from '@/src/types/domain';
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

export interface TransactionCardItemViewModel {
    id: string;
    cardProps: TransactionCardProps;
    onPress: () => void;
}

export interface AccountDetailsViewModel {
    theme: ReturnType<typeof useTheme>['theme'];
    accountLoading: boolean;
    accountMissing: boolean;
    accountName: string;
    accountType: string;
    accountTypeVariant: string;
    accountIcon: string | null;
    accountTypeColor: string;
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
}

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { theme } = useTheme();
    const accountId = params.accountId as string;

    const {
        dateRange,
        periodFilter,
        isPickerVisible: isDatePickerVisible,
        showPicker: showDatePicker,
        hidePicker: hideDatePicker,
        setFilter,
        navigatePrevious,
        navigateNext,
    } = useDateRangeFilter({ defaultToCurrentMonth: true });

    const { account, isLoading: accountLoading } = useAccount(accountId);
    const { transactions, isLoading: transactionsLoading } = useAccountTransactions(accountId, 50, dateRange || undefined);
    const { balanceData, isLoading: balanceLoading } = useAccountBalance(accountId);
    const { deleteAccount, recoverAccount: recoverAction } = useAccountActions();

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
    const accountTypeColor = typeLower === 'liability'
        ? theme.liability
        : typeLower === 'equity'
            ? theme.equity
            : typeLower === 'income'
                ? theme.income
                : typeLower === 'expense'
                    ? theme.expense
                    : theme.asset;

    const balanceText = balanceLoading
        ? '...'
        : account
            ? CurrencyFormatter.format(balance, account.currencyCode)
            : '...';

    const transactionCountText = balanceLoading
        ? '...'
        : String(transactionCount);

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
            const base = journalPresenter.getPresentation(displayType, theme, transaction.semanticLabel);
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
                        typeColor: base.colorHex,
                        typeIcon: (isIncrease ? 'arrowUp' : 'arrowDown') as IconName,
                        amountPrefix: isIncrease ? '+ ' : '− ',
                    },
                    accounts: displayAccounts,
                    notes: transaction.notes,
                }
            };
        });
    }, [onTransactionPress, theme, transactions]);

    return {
        theme,
        accountLoading,
        accountMissing: !accountLoading && !account,
        accountName: account?.name || '',
        accountType,
        accountTypeVariant: typeLower,
        accountIcon: account?.icon || null,
        accountTypeColor,
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
    };
}
