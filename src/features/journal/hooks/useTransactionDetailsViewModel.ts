import { getNow } from '@/src/utils/dateHelpers';
import { IconName } from '@/src/components/core';
import { ColorKey } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalTransactions } from '@/src/features/journal/hooks/useJournals';
import { useTransactionDetailsSmsInfo } from '@/src/features/journal/hooks/useTransactionDetailsSmsInfo';
import { useTransactionDetailsActions } from '@/src/features/journal/hooks/useTransactionDetailsActions';
import { useTheme } from '@/src/hooks/use-theme';
import {
  JournalStatusChipVariant,
  mapDisplayTransactionSplitPresentation,
  resolveJournalDetailsInfo,
  resolveJournalStatusChipVariant,
  resolveRevertPlannedActionLabels,
  resolveTransactionAmountPresentation,
} from '@/src/services/journal/transactionDetailsHelpers';
import { AccountId, DisplayTransaction, JournalId } from '@/src/types/domain';
import { formatDate } from '@/src/utils/dateUtils';
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

  const handleEdit = useCallback(() => {
    AppNavigation.toJournalEntry({ journalId });
  }, [journalId]);

  const onHistoryPress = useCallback(() => {
    AppNavigation.toAuditLog({ entityType: 'journal', entityId: journalId });
  }, [journalId]);

  const onBack = useCallback(() => {
    AppNavigation.back();
  }, []);

  const { handleDelete, handleCopy, handlePost, handleRevertToScheduled, handleSkip } =
    useTransactionDetailsActions({
      workplaceId,
      journalId,
      amountText,
      status: journalInfo?.status,
      plannedPaymentId: journalInfo?.plannedPaymentId ?? undefined,
      journalDate: journalInfo?.journalDate,
    });

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
