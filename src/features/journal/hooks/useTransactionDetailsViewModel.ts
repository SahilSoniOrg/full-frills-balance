import { IconName } from '@/src/components/core';
import { Opacity, withOpacity } from '@/src/constants';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { useJournalTransactions } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { smsService } from '@/src/services/sms-service';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { TransactionWithAccountInfo } from '@/src/types/domain';
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
}

export function useTransactionDetailsViewModel(): TransactionDetailsViewModel {
    const router = useRouter();
    const { journalId } = useLocalSearchParams<{ journalId: string }>();
    const { theme } = useTheme();
    const { deleteJournal, findJournal, duplicateJournal, postJournal } = useJournalActions();
    const { transactions, isLoading: isLoadingTransactions } = useJournalTransactions(journalId);
    const { journal, isLoading: isLoadingJournal } = useJournal(journalId);
    const [smsInfo, setSmsInfo] = useState<TransactionDetailsViewModel['smsInfo']>();

    const journalInfo = useMemo(() => journal ? {
        description: journal.description,
        date: journal.journalDate,
        status: journal.status,
        currency: journal.currencyCode,
        displayType: journal.displayType,
        totalAmount: journal.totalAmount || 0,
        plannedPaymentId: journal.plannedPaymentId,
        journalDate: journal.journalDate
    } : null, [journal]);

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

    useEffect(() => {
        let isActive = true;
        const loadSmsInfo = async () => {
            if (!journalId) return;
            const metadata = await journalRepository.findMetadataByJournalId(journalId);
            if (!metadata || metadata.importSource !== 'sms') {
                if (isActive) setSmsInfo(undefined);
                return;
            }

            const inboxRecord = await smsService.findByLinkedJournalId(journalId);
            const parsedMetadata = metadata.metadataJson ? JSON.parse(metadata.metadataJson) : {};
            if (!isActive) return;

            setSmsInfo({
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
            });
        };

        loadSmsInfo();
        return () => {
            isActive = false;
        };
    }, [journalId]);

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
        smsInfo,
        onOpenSmsInbox: smsInfo?.inboxRecordId ? () => router.push('/sms-inbox') : undefined,
        onPost: journalInfo?.status === 'PLANNED' ? handlePost : undefined,
        onSkip: journalInfo?.status === 'PLANNED' ? handleSkip : undefined,
        splitItems,
    };
}
