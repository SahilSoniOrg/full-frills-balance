import { IconName } from '@/src/components/core';
import { Opacity, withOpacity } from '@/src/constants';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { useJournalTransactions } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { TransactionWithAccountInfo } from '@/src/types/domain';
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

export interface TransactionSplitItemViewModel {
    id: string;
    accountId: string;
    accountName: string;
    transactionType: string;
    amountText: string;
    amountColor: string;
    iconName: IconName;
    iconColor: string;
    iconBackground: string;
    onPress: () => void;
}

export interface TransactionDetailsViewModel {
    theme: ReturnType<typeof useTheme>['theme'];
    isLoading: boolean;
    isMissing: boolean;
    title: string;
    backIcon: 'close';
    headerActions: {
        onCopy: () => void;
        onEdit: () => void;
        onDelete: () => void;
    };
    onBack: () => void;
    amountText: string;
    descriptionText: string;
    statusLabel: string;
    statusVariant: 'income' | 'expense';
    displayTypeLabel?: string;
    formattedDate: string;
    journalIdShort: string;
    onHistoryPress: () => void;
    splitItems: TransactionSplitItemViewModel[];
}

export function useTransactionDetailsViewModel(): TransactionDetailsViewModel {
    const router = useRouter();
    const { journalId } = useLocalSearchParams<{ journalId: string }>();
    const { theme } = useTheme();
    const { deleteJournal, findJournal, duplicateJournal } = useJournalActions();
    const { transactions, isLoading: isLoadingTransactions } = useJournalTransactions(journalId);
    const { journal, isLoading: isLoadingJournal } = useJournal(journalId);

    const journalInfo = journal ? {
        description: journal.description,
        date: journal.journalDate,
        status: journal.status,
        currency: journal.currencyCode,
        displayType: journal.displayType,
        totalAmount: journal.totalAmount || 0
    } : null;

    const isLoading = isLoadingTransactions || isLoadingJournal;

    const amountText = journalInfo ? CurrencyFormatter.format(journalInfo.totalAmount, journalInfo.currency) : '';
    const formattedDate = journalInfo ? formatDate(journalInfo.date, { includeTime: true }) : '';
    const descriptionText = journalInfo?.description || 'No description';
    const statusVariant = journalInfo?.status === 'POSTED' ? 'income' : 'expense';

    const handleDelete = useCallback(() => {
        showConfirmationAlert(
            'Delete Transaction',
            'Are you sure you want to delete this transaction? This action cannot be undone.',
            async () => {
                try {
                    const found = await findJournal(journalId);
                    if (!found) {
                        showErrorAlert('Transaction not found. It may have already been deleted.');
                        router.back();
                        return;
                    }
                    await deleteJournal(found);
                    showSuccessAlert('Deleted', 'Transaction has been deleted.');
                    router.back();
                } catch (error) {
                    logger.error('Failed to delete transaction:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not delete transaction: ${errorMessage}`);
                }
            }
        );
    }, [deleteJournal, findJournal, journalId, router]);

    const handleCopy = useCallback(async () => {
        try {
            const newJournal = await duplicateJournal(journalId);
            showSuccessAlert('Copied', 'New transaction created from copy.');
            router.push({ pathname: '/journal-entry', params: { journalId: newJournal.id } });
        } catch (error) {
            logger.error('Failed to copy transaction:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showErrorAlert(`Could not copy transaction: ${errorMessage}`);
        }
    }, [duplicateJournal, journalId, router]);

    const handleEdit = useCallback(() => {
        router.push({ pathname: '/journal-entry', params: { journalId } });
    }, [journalId, router]);

    const onHistoryPress = useCallback(() => {
        router.push(`/audit-log?entityType=journal&entityId=${journalId}`);
    }, [journalId, router]);

    const onBack = useCallback(() => {
        router.back();
    }, [router]);

    const splitItems = useMemo(() => {
        return transactions.map((item: TransactionWithAccountInfo) => {
            const isIn = item.flowDirection === 'IN';
            const color = isIn ? theme.income : theme.error;
            return {
                id: item.id,
                accountId: item.accountId,
                accountName: item.accountName,
                transactionType: item.transactionType,
                amountText: `${isIn ? '+' : '-'}${CurrencyFormatter.format(item.amount, item.currencyCode)}`,
                amountColor: color,
                iconName: (isIn ? 'arrowDown' : 'arrowUp') as IconName,
                iconColor: color,
                iconBackground: withOpacity(color, Opacity.soft),
                onPress: () => router.push(`/account-details?accountId=${item.accountId}`),
            };
        });
    }, [router, theme.error, theme.income, transactions]);

    return {
        theme,
        isLoading,
        isMissing: !isLoading && !journalInfo,
        title: 'Transaction Details',
        backIcon: 'close',
        headerActions: {
            onCopy: handleCopy,
            onEdit: handleEdit,
            onDelete: handleDelete,
        },
        onBack,
        amountText,
        descriptionText,
        statusLabel: journalInfo?.status || '',
        statusVariant,
        displayTypeLabel: journalInfo?.displayType,
        formattedDate,
        journalIdShort: journalId?.substring(0, 8) || '...',
        onHistoryPress,
        splitItems,
    };
}
