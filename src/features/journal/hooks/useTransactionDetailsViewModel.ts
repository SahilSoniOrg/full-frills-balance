import { getNow } from '@/src/utils/dateHelpers';
import { IconName } from '@/src/components/core';
import { ColorKey } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { useJournalTransactions } from '@/src/features/journal/hooks/useJournals';
import { useTransactionDetailsSmsInfo } from '@/src/features/journal/hooks/useTransactionDetailsSmsInfo';
import { useTheme } from '@/src/hooks/use-theme';
import {
  JournalStatusChipVariant,
  mapDisplayTransactionSplitPresentation,
  resolveJournalDetailsInfo,
  resolveJournalStatusChipVariant,
  resolveRevertPlannedActionLabels,
  resolveTransactionAmountPresentation,
} from '@/src/services/journal/transactionDetailsHelpers';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { AccountId, DisplayTransaction, JournalId, PlannedPaymentId } from '@/src/types/domain';
import { showConfirmationAlert, showErrorAlert, toast } from '@/src/utils/alerts';
import { formatDate } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';

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
  statusVariant: JournalStatusChipVariant;
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

  const smsInfo = useTransactionDetailsSmsInfo(workplaceId, journalId);

  const journalInfo = useMemo(
    () =>
      resolveJournalDetailsInfo({
        journal: journal ?? null,
        journalVersion: version,
        routePreview: {
          title: paramTitle,
          amount: paramAmount,
          date: paramDate,
          currencyCode: paramCurrency,
          displayType: paramDisplayType,
        },
        fallbackCurrency: workplaceCurrency,
        fallbackNow: getNow(),
      }),
    [
      journal,
      version,
      paramTitle,
      paramAmount,
      paramDate,
      paramCurrency,
      paramDisplayType,
      workplaceCurrency,
    ],
  );

  const isLoading = (isLoadingTransactions || isLoadingJournal) && !journalInfo;

  const { amountText, amountColor, isExpense } = useMemo(
    () =>
      resolveTransactionAmountPresentation({
        journalInfo,
        paramTypeColor,
        journalLoaded: Boolean(journal),
      }),
    [journalInfo, paramTypeColor, journal],
  );

  const formattedDate = journalInfo ? formatDate(journalInfo.date, { includeTime: true }) : '';
  const descriptionText = journalInfo?.description || 'No description';

  const statusVariant = useMemo(() => resolveJournalStatusChipVariant(journalInfo), [journalInfo]);

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
    const { actionLabel, statusLabel } = resolveRevertPlannedActionLabels(
      journalInfo?.status || '',
    );

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
          const pp = await plannedPaymentReadService.find(
            workplaceId,
            journalInfo.plannedPaymentId! as PlannedPaymentId,
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
      const presentation = mapDisplayTransactionSplitPresentation(item);

      return {
        id: item.id,
        accountId: item.accountId,
        accountName: item.accountName || 'Unknown Account',
        transactionType: presentation.transactionTypeLabel,
        amountText: presentation.amountText,
        amountColor: presentation.amountColor,
        iconName: item.icon || null,
        fallbackIcon: getAccountFallbackIcon(item.accountType),
        iconColor: presentation.iconColor,
        iconBackground: presentation.iconBackground,
        onPress: () => AppNavigation.toAccountDetails(item.accountId),
      };
    });
  }, [transactions]);

  const revertLabels = journalInfo
    ? resolveRevertPlannedActionLabels(journalInfo.status)
    : undefined;

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
    statusVariant,
    displayTypeLabel: journalInfo?.displayType,
    formattedDate,
    journalIdShort: journalId?.substring(0, 8) || '...',
    onHistoryPress,
    smsInfo,
    onOpenSmsInbox: smsInfo?.inboxRecordId ? AppNavigation.toTransactionInbox : undefined,
    onPost: journalInfo?.status === 'PLANNED' ? handlePost : undefined,
    onRevertToScheduled:
      (journalInfo?.status === 'POSTED' || journalInfo?.status === 'SKIPPED') &&
      !!journalInfo?.plannedPaymentId
        ? handleRevertToScheduled
        : undefined,
    revertButtonLabel: revertLabels?.revertButtonLabel,
    onSkip:
      journalInfo?.status === 'PLANNED' && !!journalInfo?.plannedPaymentId ? handleSkip : undefined,
    splitItems,
    isExpense,
    displayIcon: (paramTypeIcon as IconName) || (isExpense ? 'receipt' : 'receiptLong'),
  };
}
