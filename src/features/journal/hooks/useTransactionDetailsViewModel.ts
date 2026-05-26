import { getNow } from '@/src/utils/dateHelpers';
import { IconName } from '@/src/components/core';
import { ColorKey } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { useJournalTransactions } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { smsService } from '@/src/services/sms-service';
import { AccountId, DisplayTransaction, JournalDisplayType, JournalId } from '@/src/types/domain';
import { showConfirmationAlert, showErrorAlert, toast } from '@/src/utils/alerts';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { formatDate } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

export interface TransactionSplitItemViewModel {
  id: string;
  accountId: AccountId;
  accountName: string;
  transactionType: string;
  amountText: string;
  amountColor: ColorKey;
  iconName: IconName | string | null;
  fallbackIcon?: IconName;
  iconColor: ColorKey;
  iconBackground: ColorKey;
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
  amountColor: ColorKey;
  descriptionText: string;
  notesText?: string;
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
  onRevertToScheduled?: () => void;
  revertButtonLabel?: string;
  onSkip?: () => void;
  splitItems: TransactionSplitItemViewModel[];
  isExpense: boolean;
  displayIcon: IconName;
}

export function useTransactionDetailsViewModel(): TransactionDetailsViewModel {
  const {
    journalId,
    title: paramTitle,
    amount: paramAmount,
    currencyCode: paramCurrency,
    date: paramDate,
    typeColor: paramTypeColor,
    typeIcon: paramTypeIcon,
    displayType: paramDisplayType,
  } = useLocalSearchParams<{
    journalId: JournalId;
    title?: string;
    amount?: string;
    currencyCode?: string;
    date?: string;
    typeColor?: string;
    typeIcon?: string;
    displayType?: string;
  }>();
  const { theme } = useTheme();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const { deleteJournal, findJournal, duplicateJournal, postJournal, revertToPlanned } =
    useJournalActions(workplaceId);
  const { transactions, isLoading: isLoadingTransactions } = useJournalTransactions(
    workplaceId,
    journalId,
    true,
  );
  const {
    journal,
    isLoading: isLoadingJournal,
    version,
  } = useJournal(workplaceId, journalId, true);

  const { data: smsInfo } = useObservable(
    () => {
      if (!journalId) return of(undefined);

      return from(journalRepository.findMetadataByJournalId(journalId, workplaceId)).pipe(
        switchMap(metadata => {
          if (!metadata) return of(undefined);

          return from(smsService.findByLinkedJournalId(journalId)).pipe(
            map(inboxRecord => {
              const parsedMetadata = metadata.metadataJson ? JSON.parse(metadata.metadataJson) : {};
              return {
                sender: metadata.originalSmsSender,
                rawBody: metadata.originalSmsBody,
                amountText:
                  typeof parsedMetadata.parsedAmount === 'number'
                    ? CurrencyFormatter.format(
                        parsedMetadata.parsedAmount,
                        parsedMetadata.parsedCurrencyCode || undefined,
                      )
                    : undefined,
                referenceNumber: parsedMetadata.referenceNumber || inboxRecord?.referenceNumber,
                accountSource: parsedMetadata.accountSource || inboxRecord?.parsedAccountSource,
                parseReason: inboxRecord?.parseReason,
                smsDate: inboxRecord
                  ? formatDate(inboxRecord.inputDate, { includeTime: true })
                  : undefined,
                inboxRecordId: inboxRecord?.id,
              };
            }),
          );
        }),
      );
    },
    [journalId, workplaceId],
    undefined,
  );

  const journalInfo = useMemo(() => {
    if (journal) {
      return {
        id: journal.id,
        version,
        description: journal.description,
        notes: journal.notes,
        date: journal.journalDate,
        status: journal.status,
        currency: journal.currencyCode,
        displayType: journal.displayType,
        totalAmount: journal.totalAmount || 0,
        plannedPaymentId: journal.plannedPaymentId,
        journalDate: journal.journalDate,
      };
    }

    // Fallback to params if database record isn't loaded yet
    if (paramTitle || paramAmount) {
      return {
        description: paramTitle || 'Loading...',
        date: paramDate ? Number(paramDate) : getNow(),
        status: 'DRAFT', // Default to draft until loaded
        currency: paramCurrency || workplaceCurrency,
        displayType: paramDisplayType || 'EXPENSE',
        totalAmount: paramAmount ? Number(paramAmount) : 0,
        plannedPaymentId: null,
        journalDate: paramDate ? Number(paramDate) : getNow(),
      };
    }

    return null;
  }, [
    journal,
    version,
    paramTitle,
    paramAmount,
    paramDate,
    paramCurrency,
    paramDisplayType,
    workplaceCurrency,
  ]);

  const isLoading = (isLoadingTransactions || isLoadingJournal) && !journalInfo;

  const journalDisplayType = journalInfo?.displayType as JournalDisplayType;
  const isIncome = journalDisplayType === JournalDisplayType.INCOME;
  const isExpense = journalDisplayType === JournalDisplayType.EXPENSE;

  const amountColor = useMemo((): ColorKey => {
    if (paramTypeColor && !journal) return (paramTypeColor as ColorKey) || 'primary';
    return isIncome ? 'income' : isExpense ? 'error' : 'primary';
  }, [isIncome, isExpense, paramTypeColor, journal]);

  const amountPrefix = isIncome ? '+' : isExpense ? '-' : '';
  const amountText = journalInfo
    ? `${amountPrefix}${CurrencyFormatter.format(journalInfo.totalAmount, journalInfo.currency)}`
    : '';

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
            AppNavigation.back();
            return;
          }
          await deleteJournal(found);
          toast.success('Transaction has been deleted.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to delete transaction:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not delete transaction: ${errorMessage}`);
        }
      },
    );
  }, [deleteJournal, findJournal, journalId]);

  const handleCopy = useCallback(async () => {
    try {
      const newJournal = await duplicateJournal(journalId);
      toast.success('New transaction created from copy.');
      AppNavigation.toJournalEntry({ journalId: newJournal.id });
    } catch (error) {
      logger.error('Failed to copy transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showErrorAlert(`Could not copy transaction: ${errorMessage}`);
    }
  }, [duplicateJournal, journalId]);

  const handleEdit = useCallback(() => {
    AppNavigation.toJournalEntry({ journalId });
  }, [journalId]);

  const onHistoryPress = useCallback(() => {
    AppNavigation.toAuditLog({ entityType: 'journal', entityId: journalId });
  }, [journalId]);

  const onBack = useCallback(() => {
    AppNavigation.back();
  }, []);

  const handlePost = useCallback(async () => {
    if (!journalInfo || journalInfo.status !== 'PLANNED') return;

    showConfirmationAlert(
      'Post Transaction',
      `Are you sure you want to mark this planned transaction for ${amountText} as posted?`,
      async () => {
        try {
          await postJournal(journalId);
          toast.success('Transaction has been marked as posted.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to post transaction:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not post transaction: ${errorMessage}`);
        }
      },
    );
  }, [journalId, journalInfo, postJournal, amountText]);

  const handleRevertToScheduled = useCallback(async () => {
    const isSkipped = journalInfo?.status === 'SKIPPED';
    const actionLabel = isSkipped ? 'Unskip' : 'Unpost';
    const statusLabel = isSkipped ? 'skipped' : 'posted';

    if (!journalInfo || (journalInfo.status !== 'POSTED' && journalInfo.status !== 'SKIPPED'))
      return;

    showConfirmationAlert(
      `${actionLabel} Transaction`,
      `Are you sure you want to revert this ${statusLabel} transaction for ${amountText} back to scheduled status?`,
      async () => {
        try {
          await revertToPlanned(journalId);
          toast.success('Transaction has been reverted to scheduled status.');
          AppNavigation.back();
        } catch (error) {
          logger.error(`Failed to ${actionLabel.toLowerCase()} transaction:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not ${actionLabel.toLowerCase()} transaction: ${errorMessage}`);
        }
      },
    );
  }, [journalId, journalInfo, revertToPlanned, amountText]);

  const handleSkip = useCallback(async () => {
    if (!journalInfo || journalInfo.status !== 'PLANNED' || !journalInfo.plannedPaymentId) return;

    showConfirmationAlert(
      'Skip Transaction',
      `Are you sure you want to skip this planned transaction for ${amountText}? The schedule will advance to the next occurrence.`,
      async () => {
        try {
          const pp = await plannedPaymentRepository.find(
            workplaceId,
            journalInfo.plannedPaymentId!,
          );
          if (!pp) throw new Error('Planned payment rule not found.');
          await plannedPaymentService.skipOccurrence(workplaceId, pp, journalInfo.journalDate);
          toast.success('Transaction has been skipped.');
          AppNavigation.back();
        } catch (error) {
          logger.error('Failed to skip transaction:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showErrorAlert(`Could not skip transaction: ${errorMessage}`);
        }
      },
    );
  }, [journalInfo, amountText, workplaceId]);

  const splitItems = useMemo(() => {
    return transactions.map((item: DisplayTransaction) => {
      const isDebit = item.transactionType === 'DEBIT';

      // Flow-based logic for visual consistency:
      // Debit (+) is an Inflow/Arrival -> Green
      // Credit (-) is an Outflow/Departure -> Red
      // This ensures + is always Green and - is always Red, creating a clear "From -> To" flow.
      const isPositiveSentiment = isDebit;
      const color: ColorKey = isPositiveSentiment ? 'income' : 'error';
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
        iconName: item.icon || null,
        fallbackIcon: (isDebit ? 'wallet' : 'wallet') as IconName, // Use wallet as general fallback for accounts
        iconColor: color,
        iconBackground: color,
        onPress: () => AppNavigation.toAccountDetails(item.accountId),
      };
    });
  }, [transactions]);

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
    notesText: journalInfo?.notes || undefined,
    statusLabel: journalInfo?.status || '',
    statusVariant: statusVariant as any,
    displayTypeLabel: journalInfo?.displayType,
    formattedDate,
    journalIdShort: journalId?.substring(0, 8) || '...',
    onHistoryPress,
    smsInfo,
    onOpenSmsInbox: smsInfo?.inboxRecordId ? AppNavigation.toSmsInbox : undefined,
    onPost: journalInfo?.status === 'PLANNED' ? handlePost : undefined,
    onRevertToScheduled:
      (journalInfo?.status === 'POSTED' || journalInfo?.status === 'SKIPPED') &&
      !!journalInfo?.plannedPaymentId
        ? handleRevertToScheduled
        : undefined,
    revertButtonLabel:
      journalInfo?.status === 'SKIPPED'
        ? 'Unskip (Revert to Scheduled)'
        : 'Unpost (Revert to Scheduled)',
    onSkip:
      journalInfo?.status === 'PLANNED' && !!journalInfo?.plannedPaymentId ? handleSkip : undefined,
    splitItems,
    isExpense,
    displayIcon: (paramTypeIcon as IconName) || (isExpense ? 'receipt' : 'receiptLong'),
  };
}
