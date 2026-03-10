import { IconName } from '@/src/components/core';
import { Opacity, withOpacity } from '@/src/constants';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { useJournalTransactions } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { smsService } from '@/src/services/sms-service';
import { JournalDisplayType, TransactionWithAccountInfo } from '@/src/types/domain';
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useObservable } from '@/src/hooks/useObservable';
import { from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

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
    amountColor: string;
    descriptionText: string;
    statusLabel: string;
    statusVariant: 'income' | 'expense';
    displayTypeLabel?: string;
    formattedDate: string;
    journalIdShort: string;
    onHistoryPress: () => void;
    smsInfo?: {
        sender?: string;
        rawBody?: string;
        amountText?: string;
        referenceNumber?: string;
        accountSource?: string;
        parseReason?: string;
        smsDate?: string;
        inboxRecordId?: string;
    };
    onOpenSmsInbox?: () => void;
    onPost?: () => void;
    onSkip?: () => void;
    splitItems: TransactionSplitItemViewModel[];
    isExpense: boolean;
}

export function useTransactionDetailsViewModel(): TransactionDetailsViewModel {
    const router = useRouter();
    const { journalId } = useLocalSearchParams<{ journalId: string }>();
    const { theme } = useTheme();
    const { deleteJournal, findJournal, duplicateJournal, postJournal } = useJournalActions();
    const { transactions, isLoading: isLoadingTransactions, version: transactionsVersion } = useJournalTransactions(journalId);
    const { journal, isLoading: isLoadingJournal, version: journalVersion } = useJournal(journalId);

    const { data: smsInfo } = useObservable(
        () => {
            if (!journalId) return of(undefined);

            return from(journalRepository.findMetadataByJournalId(journalId)).pipe(
                switchMap(metadata => {
                    if (!metadata) return of(undefined);

                    return from(smsService.findByLinkedJournalId(journalId)).pipe(
                        map(inboxRecord => {
                            const parsedMetadata = metadata.metadataJson ? JSON.parse(metadata.metadataJson) : {};
                            return {
                                sender: metadata.originalSmsSender,
                                rawBody: metadata.originalSmsBody,
                                amountText: typeof parsedMetadata.parsedAmount === 'number'
                                    ? CurrencyFormatter.format(parsedMetadata.parsedAmount, parsedMetadata.parsedCurrencyCode || undefined)
                                    : undefined,
                                referenceNumber: parsedMetadata.referenceNumber || inboxRecord?.referenceNumber,
                                accountSource: parsedMetadata.accountSource || inboxRecord?.parsedAccountSource,
                                parseReason: inboxRecord?.parseReason,
                                smsDate: inboxRecord ? formatDate(inboxRecord.smsDate, { includeTime: true }) : undefined,
                                inboxRecordId: inboxRecord?.id,
                            };
                        })
                    );
                })
            );
        },
        [journalId],
        undefined
    );

    const journalInfo = useMemo(() => journal ? {
        description: journal.description,
        date: journal.journalDate,
        status: journal.status,
        currency: journal.currencyCode,
        displayType: journal.displayType,
        totalAmount: journal.totalAmount || 0,
        plannedPaymentId: journal.plannedPaymentId,
        journalDate: journal.journalDate
    } : null, [journal, journalVersion]);

    const isLoading = isLoadingTransactions || isLoadingJournal;

    const journalDisplayType = journalInfo?.displayType as JournalDisplayType;
    const isIncome = journalDisplayType === JournalDisplayType.INCOME;
    const isExpense = journalDisplayType === JournalDisplayType.EXPENSE;

    const amountColor = isIncome ? theme.income : isExpense ? theme.error : theme.primary;
    const amountPrefix = isIncome ? '+' : isExpense ? '-' : '';
    const amountText = journalInfo ? `${amountPrefix}${CurrencyFormatter.format(journalInfo.totalAmount, journalInfo.currency)}` : '';

    const formattedDate = journalInfo ? formatDate(journalInfo.date, { includeTime: true }) : '';
    const descriptionText = journalInfo?.description || 'No description';

    const statusVariant = useMemo(() => {
        if (!journalInfo) return 'default';
        if (journalInfo.status === 'POSTED') return 'income';
        if (journalInfo.status === 'PLANNED') return 'primary';
        if (journalInfo.status === 'DRAFT') return 'default';
        return 'default';
    }, [journalInfo]);

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


    const handlePost = useCallback(async () => {
        if (!journalInfo || journalInfo.status !== 'PLANNED') return;

        showConfirmationAlert(
            'Post Transaction',
            `Are you sure you want to mark this planned transaction for ${amountText} as posted?`,
            async () => {
                try {
                    await postJournal(journalId);
                    showSuccessAlert('Posted', 'Transaction has been marked as posted.');
                } catch (error) {
                    logger.error('Failed to post transaction:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not post transaction: ${errorMessage}`);
                }
            }
        );
    }, [journalId, journalInfo, postJournal, amountText]);

    const handleSkip = useCallback(async () => {
        if (!journalInfo || journalInfo.status !== 'PLANNED' || !journalInfo.plannedPaymentId) return;

        showConfirmationAlert(
            'Skip Transaction',
            `Are you sure you want to skip this planned transaction for ${amountText}? The schedule will advance to the next occurrence.`,
            async () => {
                try {
                    const pp = await plannedPaymentRepository.find(journalInfo.plannedPaymentId!);
                    if (!pp) throw new Error('Planned payment rule not found.');
                    await plannedPaymentService.skipOccurrence(pp, journalInfo.journalDate);
                    showSuccessAlert('Skipped', 'Transaction has been skipped.');
                    router.back();
                } catch (error) {
                    logger.error('Failed to skip transaction:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not skip transaction: ${errorMessage}`);
                }
            }
        );
    }, [journalInfo, router, amountText]);

    const splitItems = useMemo(() => {
        return transactions.map((item: TransactionWithAccountInfo) => {
            const isDebit = item.transactionType === 'DEBIT';

            // Flow-based logic for visual consistency:
            // Debit (+) is an Inflow/Arrival -> Green
            // Credit (-) is an Outflow/Departure -> Red
            // This ensures + is always Green and - is always Red, creating a clear "From -> To" flow.
            const isPositiveSentiment = isDebit;
            const color = isPositiveSentiment ? theme.income : theme.error;
            const flowLabel = isDebit ? 'To' : 'From';

            return {
                id: item.id,
                accountId: item.accountId,
                accountName: item.accountName || 'Unknown Account',
                transactionType: `${flowLabel} • ${item.transactionType}`,
                // Signs should reflect flow direction: Debit (+) is INTO, Credit (-) is FROM
                amountText: `${isDebit ? '+' : '-'}${CurrencyFormatter.format(item.amount, item.currencyCode)}`,
                amountColor: color,
                // Icons should reflect flow: Down (+) to account, Up (-) from account
                iconName: (isDebit ? 'arrowDown' : 'arrowUp') as IconName,
                iconColor: color,
                iconBackground: withOpacity(color, Opacity.soft),
                onPress: () => router.push(`/account-details?accountId=${item.accountId}`),
            };
        });
    }, [router, theme.error, theme.income, transactions, transactionsVersion]);

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
        amountColor,
        descriptionText,
        statusLabel: journalInfo?.status || '',
        statusVariant: statusVariant as any,
        displayTypeLabel: journalInfo?.displayType,
        formattedDate,
        journalIdShort: journalId?.substring(0, 8) || '...',
        onHistoryPress,
        smsInfo,
        onOpenSmsInbox: smsInfo?.inboxRecordId ? () => router.push('/sms-inbox') : undefined,
        onPost: journalInfo?.status === 'PLANNED' ? handlePost : undefined,
        onSkip: journalInfo?.status === 'PLANNED' ? handleSkip : undefined,
        splitItems,
        isExpense,
    };
}
