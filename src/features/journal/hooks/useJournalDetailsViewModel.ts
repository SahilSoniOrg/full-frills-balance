import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import {
  evaluateJournalBalance,
  isJournalFullyValued,
  type JournalBalanceEvaluation,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { useJournal } from '@/src/features/journal/hooks/useJournal';
import { useJournalDetailsActions } from '@/src/features/journal/hooks/useJournalDetailsActions';
import { useJournalLegs } from '@/src/features/journal/hooks/useJournals';
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useObservable } from '@/src/hooks/useObservable';
import { currencyReadService } from '@/src/services/currency-read-service';
import { inferSimpleTabTypeFromTwoLegs } from '@/src/services/journal/journalEditorHelpers';
import { ORPHANED_PLANNED_JOURNAL_NOTICE } from '@/src/services/planned-payment/projectablePlannedJournals';
import { plannedPaymentReadService } from '@/src/services/planned-payment/plannedPaymentReadService';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import type { JournalId } from '@/src/types/ids';
import { formatDate } from '@/src/utils/dateUtils';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { of } from 'rxjs';
import {
  buildJournalEntries,
  buildJournalSchedule,
  buildJournalSplitItems,
  buildJournalSummary,
  buildReversalLinks,
  plannedMove,
  type JournalBudgetModel,
  type JournalEntriesPresentation,
  type JournalHistoryModel,
  type JournalPlannedModel,
  type JournalScheduleModel,
  type JournalSourceModel,
  type JournalSummaryModel,
} from '../journalDetailsPresentation';
import {
  useJournalBudgetImpact,
  useJournalHistory,
  useJournalSource,
} from './useJournalDetailsEnrichment';

export interface JournalDetailsSections {
  journalId: JournalId;
  summary: JournalSummaryModel;
  note?: string;
  planned?: JournalPlannedModel;
  entries: JournalEntriesPresentation;
  balanceEvaluation?: JournalBalanceEvaluation;
  budget: JournalBudgetModel;
  schedule?: JournalScheduleModel;
  source: JournalSourceModel;
  history: JournalHistoryModel;
}

export interface JournalDetailsViewModel {
  isLoading: boolean;
  headerActions: {
    onCopy: () => void;
    onEdit: () => void;
    onDelete: () => void;
  };
  onBack: () => void;
  /** Null once loading finishes means the journal does not exist. */
  details: JournalDetailsSections | null;
}

export function useJournalDetailsViewModel(): JournalDetailsViewModel {
  const { journalId } = useLocalSearchParams<{ journalId: JournalId }>();
  const { workplaceId } = useWorkplace();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const today = useCalendarDay();

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
  const source = useJournalSource(journalId, workplaceId, version);
  const budget = useJournalBudgetImpact(workplaceId, transactions, journal?.journalDate, today);
  const history = useJournalHistory(journalId, workplaceId, transactions);

  const { data: linkedPlannedPayment, isLoading: isLoadingPlannedPayment } = useObservable(
    () =>
      journal?.plannedPaymentId
        ? plannedPaymentReadService.observeObligationById(workplaceId, journal.plannedPaymentId)
        : of(null),
    [workplaceId, journal?.plannedPaymentId],
    null,
  );
  const { data: currencies, isLoading: isLoadingCurrencies } = useObservable(
    () => currencyReadService.observeAll(),
    [],
    [],
  );

  const status = journal?.status;
  const isOrphaned =
    status === JournalStatus.PLANNED &&
    !!journal?.plannedPaymentId &&
    linkedPlannedPayment === null &&
    !isLoadingPlannedPayment;

  const {
    handleDelete,
    handleCopy,
    handlePost,
    handleRevertToScheduled,
    handleSkip,
    pendingAction,
  } = useJournalDetailsActions({
    workplaceId,
    journalId,
    amount: journal?.totalAmount ?? 0,
    currencyCode: journal?.currencyCode ?? '',
    status,
    plannedPaymentId: journal?.plannedPaymentId,
    journalDate: journal?.journalDate,
  });

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
      initialDate: journal ? new Date(journal.journalDate).toISOString() : undefined,
      sourceAccountId,
      destinationAccountId,
      amount: journal ? String(journal.totalAmount) : undefined,
      notes: journal?.notes || undefined,
      description: journal?.description || undefined,
      params: {
        ...(mode ? { mode } : {}),
        ...(type ? { type } : {}),
      },
    });
  }, [journalId, transactions, journal]);

  const balanceEvaluation = useMemo(
    () =>
      journal && !isLoadingTransactions && !isLoadingCurrencies
        ? evaluateJournalBalance({
            journalCurrency: journal.currencyCode,
            precisionByCurrency: new Map(currencies.map(item => [item.code, item.precision])),
            lines: transactions.map(item => ({
              id: item.id,
              accountId: item.accountId,
              accountCurrency: item.currencyCode,
              amount: item.amount,
              exchangeRate: item.exchangeRate,
              transactionType: item.transactionType,
            })),
          })
        : undefined,
    [journal, transactions, currencies, isLoadingTransactions, isLoadingCurrencies],
  );
  const entries = useMemo(
    () =>
      buildJournalEntries(
        buildJournalSplitItems(transactions, AppNavigation.toAccountDetails, balanceEvaluation),
        journal?.currencyCode ?? '',
        status ?? '',
        balanceEvaluation,
      ),
    [transactions, balanceEvaluation, journal?.currencyCode, status],
  );

  const details = useMemo((): JournalDetailsSections | null => {
    if (!journal) return null;
    const strings = AppConfig.strings.journalDetails;
    const formatTimestamp = (value: number | undefined) =>
      value !== undefined && Number.isFinite(value)
        ? formatDate(value, { includeTime: true, hourCycle: resolvedHourCycle })
        : undefined;
    return {
      journalId: journal.id,
      summary: buildJournalSummary(journal, {
        evaluation: balanceEvaluation,
        entryCount: transactions.length,
        today,
        hourCycle: resolvedHourCycle,
      }),
      note: journal.notes || undefined,
      planned:
        status === JournalStatus.PLANNED
          ? {
              notice: isOrphaned ? ORPHANED_PLANNED_JOURNAL_NOTICE : undefined,
              move: plannedMove(
                entries,
                journal.displayType,
                !!balanceEvaluation && isJournalFullyValued(balanceEvaluation),
              ),
              onPost: handlePost,
              onSkip:
                journal.plannedPaymentId && !isOrphaned && !isLoadingPlannedPayment
                  ? handleSkip
                  : undefined,
              pending: pendingAction ?? undefined,
            }
          : undefined,
      entries,
      balanceEvaluation,
      budget,
      schedule: linkedPlannedPayment
        ? buildJournalSchedule(linkedPlannedPayment, journal.journalDate, {
            onPress: () => AppNavigation.toPlannedPaymentDetails(linkedPlannedPayment.id),
            onRevert:
              status === JournalStatus.POSTED || status === JournalStatus.SKIPPED
                ? handleRevertToScheduled
                : undefined,
          })
        : undefined,
      source,
      history: {
        ...history,
        onOpenFullLog: () =>
          AppNavigation.toAuditLog({ entityType: 'journal', entityId: journalId }),
        timestamps: [
          { label: strings.created, value: formatTimestamp(journal.createdAt) },
          { label: strings.updated, value: formatTimestamp(journal.updatedAt) },
        ].flatMap(({ label, value }) => (value ? [{ label, value }] : [])),
        links: buildReversalLinks(journal, AppNavigation.toJournalDetails),
      },
    };
  }, [
    journal,
    journalId,
    status,
    balanceEvaluation,
    transactions.length,
    today,
    resolvedHourCycle,
    isOrphaned,
    isLoadingPlannedPayment,
    linkedPlannedPayment,
    entries,
    budget,
    source,
    history,
    handlePost,
    handleSkip,
    pendingAction,
    handleRevertToScheduled,
  ]);

  return {
    isLoading: isLoadingTransactions || isLoadingJournal || isLoadingCurrencies,
    headerActions: {
      onCopy: handleCopy,
      onEdit: handleEdit,
      onDelete: handleDelete,
    },
    onBack: AppNavigation.back,
    details,
  };
}
