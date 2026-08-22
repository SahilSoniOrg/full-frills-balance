import { getNow } from '@/src/utils/dateHelpers';
import { IconName } from '@/src/components/core';
import { ColorKey } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalLegs } from '@/src/features/journal/hooks/useJournals';
import { useJournalDetailsSmsInfo } from '@/src/features/journal/hooks/useJournalDetailsSmsInfo';
import { useObservable } from '@/src/hooks/useObservable';
import {
  buildJournalSplitItems,
  JournalSplitItemViewModel,
} from '@/src/features/journal/hooks/journalDetailsSplitItems';
import { useJournalDetailsActions } from '@/src/features/journal/hooks/useJournalDetailsActions';
import { ORPHANED_PLANNED_JOURNAL_NOTICE } from '@/src/services/planned-payment/projectablePlannedJournals';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import {
  JournalStatusChipVariant,
  resolveJournalDetailsInfo,
  resolveJournalStatusChipVariant,
  resolveRevertPlannedActionLabels,
  resolveJournalAmountPresentation,
} from '@/src/services/journal/journalDetailsHelpers';
import { inferSimpleTabTypeFromTwoLegs } from '@/src/services/journal/journalEditorHelpers';
import { JournalId, TransactionType } from '@/src/types/domain';
import { formatDate } from '@/src/utils/dateUtils';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { of } from 'rxjs';

export interface JournalDetailsViewModel {
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
  amount: number;
  currencyCode: string;
  amountPrefix: '+' | '-' | '';
  amountColor: ColorKey;
  descriptionText: string;
  notesText?: string;
  statusLabel: string;
  statusVariant: JournalStatusChipVariant;
  displayTypeLabel?: string;
  statusNotice?: string;
  formattedDate: string;
  journalIdShort: string;
  onHistoryPress: () => void;
  smsInfo?: {
    sender?: string;
    rawBody?: string;
    amount?: number;
    currencyCode?: string;
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
  splitItems: JournalSplitItemViewModel[];
  isExpense: boolean;
  displayIcon: IconName;
}

export function useJournalDetailsViewModel(): JournalDetailsViewModel {
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
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const { transactions, isLoading: isLoadingTransactions } = useJournalLegs(
    workplaceId,
    journalId,
    true,
  );
  const {
    journal,
    isLoading: isLoadingJournal,
    version,
  } = useJournal(workplaceId, journalId, true);

  const smsInfo = useJournalDetailsSmsInfo(workplaceId, journalId);

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

  const { amount, currencyCode, amountPrefix, amountColor, isExpense } = useMemo(
    () =>
      resolveJournalAmountPresentation({
        journalInfo,
        paramTypeColor,
        journalLoaded: Boolean(journal),
      }),
    [journalInfo, paramTypeColor, journal],
  );

  const formattedDate = journalInfo ? formatDate(journalInfo.date, { includeTime: true }) : '';
  const descriptionText = journalInfo?.description || 'No description';

  const statusVariant = useMemo(() => resolveJournalStatusChipVariant(journalInfo), [journalInfo]);

  const handleEdit = useCallback(() => {
    if (!journalId) return;

    let sourceAccountId: string | undefined;
    let destinationAccountId: string | undefined;
    let type: 'expense' | 'income' | 'transfer' | undefined;
    let mode: 'simple' | 'advanced' | undefined;

    if (transactions.length === 2) {
      const credit = transactions.find(t => t.transactionType === TransactionType.CREDIT);
      const debit = transactions.find(t => t.transactionType === TransactionType.DEBIT);
      if (credit && debit) {
        sourceAccountId = credit.accountId;
        destinationAccountId = debit.accountId;
        mode = 'simple';
        if (credit.accountType && debit.accountType) {
          type = inferSimpleTabTypeFromTwoLegs(credit.accountType, debit.accountType);
        }
      }
    } else if (transactions.length > 2) {
      mode = 'advanced';
    }

    AppNavigation.toJournalEntry({
      journalId,
      initialDate: journalInfo
        ? new Date(journalInfo.journalDate || journalInfo.date).toISOString()
        : undefined,
      sourceAccountId,
      destinationAccountId,
      amount: amount != null ? String(amount) : undefined,
      notes: journalInfo?.notes || undefined,
      params: {
        ...(mode ? { mode } : {}),
        ...(type ? { type } : {}),
        ...(journalInfo?.description ? { description: journalInfo.description } : {}),
      },
    });
  }, [journalId, transactions, journalInfo, amount]);

  const onHistoryPress = useCallback(() => {
    AppNavigation.toAuditLog({ entityType: 'journal', entityId: journalId });
  }, [journalId]);

  const onBack = useCallback(() => {
    AppNavigation.back();
  }, []);

  const { data: linkedPlannedPayment, isLoading: isLoadingPP } = useObservable(
    () =>
      journalInfo?.plannedPaymentId
        ? plannedPaymentReadService.observeById(workplaceId, journalInfo.plannedPaymentId)
        : of(null),
    [workplaceId, journalInfo?.plannedPaymentId],
    null,
  );

  const isOrphaned =
    journalInfo?.status === 'PLANNED' &&
    !!journalInfo.plannedPaymentId &&
    linkedPlannedPayment === null &&
    !isLoadingPP;

  const { handleDelete, handleCopy, handlePost, handleRevertToScheduled, handleSkip } =
    useJournalDetailsActions({
      workplaceId,
      journalId,
      amount,
      currencyCode,
      status: journalInfo?.status,
      plannedPaymentId: journalInfo?.plannedPaymentId ?? undefined,
      journalDate: journalInfo?.journalDate,
    });

  const splitItems = useMemo(() => {
    return buildJournalSplitItems(transactions, AppNavigation.toAccountDetails);
  }, [transactions]);

  const revertLabels = journalInfo
    ? resolveRevertPlannedActionLabels(journalInfo.status)
    : undefined;

  return {
    isLoading,
    isMissing: !isLoading && !journalInfo,
    title: 'Journal details',
    backIcon: 'close',
    headerActions: {
      onCopy: handleCopy,
      onEdit: handleEdit,
      onDelete: handleDelete,
    },
    onBack,
    amount,
    currencyCode,
    amountPrefix,
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
    statusNotice: isOrphaned ? ORPHANED_PLANNED_JOURNAL_NOTICE : undefined,
    onPost: journalInfo?.status === 'PLANNED' ? handlePost : undefined,
    onRevertToScheduled:
      (journalInfo?.status === 'POSTED' || journalInfo?.status === 'SKIPPED') &&
      !!journalInfo?.plannedPaymentId
        ? handleRevertToScheduled
        : undefined,
    revertButtonLabel: revertLabels?.revertButtonLabel,
    onSkip:
      journalInfo?.status === 'PLANNED' && !!journalInfo?.plannedPaymentId && !isOrphaned
        ? handleSkip
        : undefined,
    splitItems,
    isExpense,
    displayIcon: (paramTypeIcon as IconName) || (isExpense ? 'receipt' : 'receiptLong'),
  };
}
