import { isValidIconName, type IconName } from '@/src/components/core';
import { Icon, parseIconName } from '@/src/types/domainIcons';
import { ColorKey } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalLegs } from '@/src/features/journal/hooks/useJournals';
import { findJournalMetadataByJournalId } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { smsService } from '@/src/services/sms-service';
import { from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useObservable } from '@/src/hooks/useObservable';
import { getAccountFallbackIcon } from '@/src/components/account-selection';
import { useJournalDetailsActions } from '@/src/features/journal/hooks/useJournalDetailsActions';
import { ORPHANED_PLANNED_JOURNAL_NOTICE } from '@/src/services/planned-payment/projectablePlannedJournals';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import {
  JournalStatusChipVariant,
  mapJournalLegSplitPresentation,
  mapSmsJournalMetadataDisplay,
  resolveJournalDetailsInfo,
  resolveJournalStatusChipVariant,
  resolveRevertPlannedActionLabels,
  resolveJournalAmountPresentation,
  type SmsJournalInfoDisplay,
} from '@/src/services/journal/journalDetailsHelpers';
import { inferSimpleTabTypeFromTwoLegs } from '@/src/services/journal/journalEditorHelpers';
import { AccountId, type JournalId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { formatDate, getNow } from '@/src/utils/dateUtils';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { DisplayTransaction } from '@/src/types/domainReadModels';

export interface JournalSplitItemViewModel {
  id: string;
  accountId: AccountId;
  accountName: string;
  transactionType: string;
  amount: number;
  currencyCode: string;
  amountPrefix: '+' | '-';
  amountColor: ColorKey;
  iconName: IconName | null;
  fallbackIcon?: IconName;
  iconColor: ColorKey;
  iconBackground: ColorKey;
  onPress: () => void;
}

export function buildJournalSplitItems(
  transactions: DisplayTransaction[],
  onAccountPress: (accountId: AccountId) => void,
): JournalSplitItemViewModel[] {
  return transactions.map(item => {
    const presentation = mapJournalLegSplitPresentation(item);

    return {
      id: item.id,
      accountId: item.accountId,
      accountName: item.accountName || 'Unknown Account',
      transactionType: presentation.transactionTypeLabel,
      amount: presentation.amount,
      currencyCode: presentation.currencyCode,
      amountPrefix: presentation.amountPrefix,
      amountColor: presentation.amountColor,
      iconName: isValidIconName(item.icon) ? item.icon : null,
      fallbackIcon: getAccountFallbackIcon(item.accountType),
      iconColor: presentation.iconColor,
      iconBackground: presentation.iconBackground,
      onPress: () => onAccountPress(item.accountId),
    };
  });
}

export interface JournalDetailsViewModel {
  isLoading: boolean;
  isMissing: boolean;
  title: string;
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
  onHistoryPress: () => void;
  smsInfo?: SmsJournalInfoDisplay[];
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

  const { data: smsInfo } = useObservable<SmsJournalInfoDisplay[] | undefined>(
    () => {
      if (!journalId) return of(undefined);

      return from(findJournalMetadataByJournalId(journalId, workplaceId)).pipe(
        switchMap(metadata =>
          from(smsService.findAllByLinkedJournalId(workplaceId, journalId)).pipe(
            map(inboxRecords => {
              if (!metadata && inboxRecords.length === 0) return undefined;
              const records = inboxRecords.length > 0 ? inboxRecords : [null];
              return records.map((inboxRecord, index) =>
                mapSmsJournalMetadataDisplay({
                  originalSmsSender: index === 0 ? metadata?.originalSmsSender : undefined,
                  originalSmsBody: index === 0 ? metadata?.originalSmsBody : undefined,
                  metadataJson: index === 0 ? metadata?.metadataJson : undefined,
                  inboxRecord,
                }),
              );
            }),
          ),
        ),
      );
    },
    [journalId, workplaceId],
    undefined,
  );

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

  const { resolvedHourCycle } = useHourCyclePrefs();

  const formattedDate = useMemo(
    () =>
      journalInfo
        ? formatDate(journalInfo.date, { includeTime: true, hourCycle: resolvedHourCycle })
        : '',
    [journalInfo, resolvedHourCycle],
  );
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
      description: journalInfo?.description || undefined,
      params: {
        ...(mode ? { mode } : {}),
        ...(type ? { type } : {}),
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
        ? plannedPaymentReadService.observeObligationById(workplaceId, journalInfo.plannedPaymentId)
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
    onHistoryPress,
    smsInfo,
    onOpenSmsInbox: smsInfo?.some(item => item.inboxRecordId)
      ? AppNavigation.toTransactionInbox
      : undefined,
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
    displayIcon: parseIconName(paramTypeIcon, isExpense ? Icon.Receipt : Icon.TrendingUp),
  };
}
