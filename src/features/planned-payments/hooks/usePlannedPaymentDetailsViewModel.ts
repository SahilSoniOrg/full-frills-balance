import type { SelectionAction } from '@/src/components/shared/SelectionActionBar';
import { AppConfig } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields, PlainJournal } from '@/src/types/plainDtos';
import {
  buildPlannedPaymentDetailsActions,
  resolvePlannedPaymentActionTarget,
} from '@/src/features/planned-payments/hooks/plannedPaymentDetailsActions';
import { useAccount } from '@/src/hooks/useAccounts';
import {
  useJournals,
  useJournalsBulkOperations,
  type JournalListModalsProps,
} from '@/src/features/journal';
import { formatPlannedPaymentInterval } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import { recordPlannedOccurrenceWithFxReview } from '@/src/services/planned-payment/recordPlannedOccurrenceWithFxReview';
import { usePlannedPaymentRecord } from '@/src/features/planned-payments/hooks/usePlannedPaymentRecord';
import { useSelection } from '@/src/hooks/useSelection';
import { useTheme } from '@/src/hooks/use-theme';
import { shareJournalEntries } from '@/src/services/sharing/JournalShareProvider';
import { deletePlannedPayment } from '@/src/services/planned-payment/plannedPaymentCommands';
import { togglePlannedPaymentStatus } from '@/src/services/planned-payment/plannedPaymentLifecycle';
import { skipPlannedPaymentOccurrence } from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { analytics } from '@/src/services/analytics';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalStatus, PlannedPaymentStatus } from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { toast } from '@/src/utils/alerts';
import { formatDate, getNow } from '@/src/utils/dateUtils';
import {
  getNextPlannedPaymentOccurrences,
  plannedPaymentDetailService,
  summarizePlannedPaymentActivity,
  type PlannedPaymentActivitySummary,
  type PlannedPaymentNextOccurrence,
} from '@/src/services/planned-payment/plannedPaymentDetailService';
import { observeAuditTrail } from '@/src/services/audit-service';
import type { Money } from '@/src/types/domainReadModels';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { of } from 'rxjs';
import { useObservable } from '@/src/hooks/useObservable';
import {
  countRemainingPlannedOccurrences,
  findFirstRecordedDate,
  findPausedAtFromAudit,
} from './plannedPaymentDetailsViewModelData';

type PendingAction = 'record' | 'skip' | 'toggle' | 'delete';

const ACTION_ERRORS: Record<PendingAction, string> = {
  record: 'Could not record this occurrence. Try again.',
  skip: 'Could not skip this occurrence. Try again.',
  toggle: 'Could not update the schedule. Try again.',
  delete: 'Could not delete this schedule. Try again.',
};

export interface PlannedPaymentDetailsViewModel {
  theme: Theme;
  isLoading: boolean;
  isMissing: boolean;
  isPreview?: boolean;
  onBack: () => void;

  amount?: number | null;
  currencyCode?: string;
  nameText?: string;
  status?: PlannedPaymentStatus;

  intervalLabel?: string;
  nextOccurrenceText?: string;
  isAutoPost?: boolean;
  description?: string;
  startDateText?: string;
  endDateText?: string;
  occurrenceAmount?: Money;
  outstandingJournalId?: JournalId;
  nextOccurrences?: PlannedPaymentNextOccurrence[];
  nextOccurrenceDate?: number;
  showcasedOccurrenceDate?: number;
  remainingOccurrenceCount?: number;
  endTimestamp?: number;
  pausedSinceDate?: number;
  firstRecordedDate?: number;
  activitySummary?: PlannedPaymentActivitySummary;
  isLoadingActivity?: boolean;
  isLoadingHistory?: boolean;
  activityError?: string;
  onRetryActivity?: () => void;
  pendingAction?: 'record' | 'skip' | 'toggle' | 'delete' | null;
  actionError?: string | null;

  fromAccount?: AccountFields | null;
  toAccount?: AccountFields | null;

  history?: EnrichedJournal[];
  reversalJournalIds?: Set<JournalId>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;

  headerActions?: {
    onEdit: () => void;
    onDelete: () => void;
  };
  onPost?: () => void;
  onSkip?: () => void;
  onToggleStatus?: () => void;
  onOpenJournal: (journalId: JournalId) => void;
  onOpenAccount: (accountId: AccountId) => void;

  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
  actions?: SelectionAction[];
  modals?: JournalListModalsProps;
}

function getStringParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

function getFiniteNumberParam(value: string | string[] | undefined): number | undefined {
  const parsed = Number(getStringParam(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function usePlannedPaymentDetailsViewModel(id: string): PlannedPaymentDetailsViewModel {
  const { theme } = useTheme();
  const { workplaceId } = useWorkplace();
  const isPrivacyMode = useEffectivePrivacyMode();
  const params = useLocalSearchParams();
  const { data: statusAudit } = useObservable(
    () => (id ? observeAuditTrail('planned_payment', id, workplaceId, 500) : of([])),
    [id, workplaceId],
    [],
    { keepPreviousData: false },
  );

  const pDesc = getStringParam(params.pDesc);
  const pAmount = getStringParam(params.pAmount);
  const pCurrency = getStringParam(params.pCurrency);
  const pDate = getFiniteNumberParam(params.pDate);

  const { item, isLoading: isItemLoading } = usePlannedPaymentRecord(workplaceId, id);
  const {
    data: activity,
    isLoading: isLoadingActivity,
    error: activityError,
    retry: retryActivity,
  } = useObservable<PlainJournal[] | null>(
    () =>
      id
        ? plannedPaymentDetailService.observeActivity(workplaceId, id as PlannedPaymentId)
        : of(null),
    [id, workplaceId],
    null,
    { keepPreviousData: false },
  );
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const actionLock = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const runAction = useCallback(
    async (
      action: PendingAction,
      operation: () => Promise<void | boolean>,
      successMessage?: string,
    ) => {
      if (actionLock.current) return;
      actionLock.current = true;
      setPendingAction(action);
      setActionError(null);
      try {
        const completed = await operation();
        if (completed !== false && successMessage) toast.success(successMessage);
      } catch {
        setActionError(ACTION_ERRORS[action]);
      } finally {
        actionLock.current = false;
        setPendingAction(null);
      }
    },
    [],
  );
  const {
    journals: history,
    isLoading: isHistoryLoading,
    isLoadingMore,
    hasMore,
    loadMore,
  } = useJournals(
    workplaceId,
    20,
    undefined,
    undefined,
    [
      JournalStatus.POSTED,
      JournalStatus.REVERSED,
      JournalStatus.PLANNED,
      JournalStatus.SKIPPED,
      JournalStatus.PAUSED,
    ],
    id,
  );
  const handleEdit = useCallback(() => {
    if (id) {
      AppNavigation.toPlannedPaymentForm(
        id,
        item
          ? {
              description: item.name,
              amount: item.amount,
              currency: item.currencyCode,
            }
          : undefined,
      );
    }
  }, [id, item]);
  const handleToggleStatus = useCallback(async () => {
    if (!item) return;
    await runAction('toggle', async () => {
      const newStatus = await togglePlannedPaymentStatus(workplaceId, item.id);
      analytics.trackFeatureUsage('planned_payment', 'toggle_status', {
        payment_id: item.id,
        new_status: newStatus,
        previous_status: item.status,
      });
    });
  }, [item, workplaceId, runAction]);
  const handleDelete = useCallback(async () => {
    if (!item) return;
    await runAction('delete', async () => {
      await deletePlannedPayment(workplaceId, item.id);
      analytics.trackFeatureUsage('planned_payment', 'delete', {
        payment_id: item.id,
        payment_name: item.name,
        amount: item.amount,
      });
      AppNavigation.back();
    });
  }, [item, workplaceId, runAction]);
  const handlePostNow = useCallback(async () => {
    if (!item) return;
    const target = resolvePlannedPaymentActionTarget(item);
    if (!target) return;
    await runAction(
      'record',
      async () => {
        const completed = await recordPlannedOccurrenceWithFxReview(
          workplaceId,
          item.id,
          target.occurrenceDate,
          target.journalId,
        );
        if (!completed) return false;
        analytics.trackFeatureUsage('planned_payment', 'post_now', {
          payment_id: item.id,
          amount: item.amount,
          currency: item.currencyCode,
          next_occurrence: target.occurrenceDate,
        });
      },
      'Occurrence recorded',
    );
  }, [item, workplaceId, runAction]);
  const handleSkip = useCallback(async () => {
    if (!item) return;
    const target = resolvePlannedPaymentActionTarget(item);
    if (!target) return;
    await runAction(
      'skip',
      async () => {
        await skipPlannedPaymentOccurrence(workplaceId, item.id, target.occurrenceDate);
        analytics.trackFeatureUsage('planned_payment', 'skip', {
          payment_id: item.id,
          amount: item.amount,
          next_occurrence: target.occurrenceDate,
        });
      },
      'Occurrence skipped',
    );
  }, [item, workplaceId, runAction]);
  const isLoading = isItemLoading;
  const isLoadingHistory = isHistoryLoading;

  const { account: fromAccount } = useAccount(item?.fromAccountId || null, workplaceId);
  const { account: toAccount } = useAccount(item?.toAccountId || null, workplaceId);

  const isMissing = !isLoading && !item;

  // Build a preview-based skeleton if DB record is still loading
  const isLoadingVisible = isLoading && !pDesc;

  const selectionControl = useSelection<JournalId>();
  const {
    selectedIds,
    isSelectionModeActive,
    toggleSelection,
    onLongPressItem,
    clearItems,
    exitSelectionMode,
  } = selectionControl;

  const selectAll = useCallback(() => {
    if (!history) return;
    selectionControl.selectAll(history.map(j => j.id));
  }, [history, selectionControl]);

  const onShareSelected = useCallback(async () => {
    if (selectedIds.size === 0 || !history) return;
    try {
      const selectedJournals = history.filter(j => selectedIds.has(j.id));
      await shareJournalEntries(
        selectedJournals.map(j => ({
          id: j.id,
          date: j.journalDate,
          description: j.description || j.semanticLabel || 'Entry',
          amount: j.totalAmount,
          currencyCode: j.currencyCode,
          displayType: j.displayType,
        })),
        {
          title: `Entries for ${item?.name || 'Scheduled Bill'}`,
          includeTime: true,
          sort: 'desc',
          showEmojis: true,
        },
      );
    } catch (error) {
      logger.error('Failed to share journal entries', error);
    }
  }, [selectedIds, history, item]);

  const bulkOperations = useJournalsBulkOperations({
    workplaceId,
    journals: history ?? [],
    selection: selectionControl,
    onShareSelected,
  });

  const onOpenJournal = useCallback((journalId: JournalId) => {
    AppNavigation.toJournalDetails(journalId);
  }, []);
  const onOpenAccount = useCallback((accountId: AccountId) => {
    AppNavigation.toAccountDetails(accountId);
  }, []);

  const selectionProps = useMemo(
    () => ({
      selectedIds,
      isSelectionModeActive,
      onLongPressItem,
      toggleSelection,
      selectAll,
      clearItems,
      exitSelectionMode,
      onShareSelected,
      actions: bulkOperations.actions,
      modals: bulkOperations.modals,
      onOpenJournal,
      onOpenAccount,
    }),
    [
      selectedIds,
      isSelectionModeActive,
      onLongPressItem,
      toggleSelection,
      selectAll,
      clearItems,
      exitSelectionMode,
      onShareSelected,
      bulkOperations.actions,
      bulkOperations.modals,
      onOpenJournal,
      onOpenAccount,
    ],
  );

  return useMemo(() => {
    if (!item) {
      // Show preview skeleton while loading
      if (pDesc && isLoading) {
        const previewAmount = pAmount ? parseFloat(pAmount) : null;
        return {
          theme,
          isLoading: isLoadingVisible,
          isMissing: false,
          isPreview: true,
          onBack: () => AppNavigation.back(),
          amount: previewAmount !== null && Number.isFinite(previewAmount) ? previewAmount : null,
          currencyCode: pCurrency,
          nameText: pDesc,
          nextOccurrenceText: pDate ? formatDate(pDate) : '...',
          isAutoPost: false,
          fromAccount: null,
          toAccount: null,
          history: [],
          ...selectionProps,
        };
      }
      return {
        theme,
        isLoading,
        isMissing: true,
        onBack: () => AppNavigation.back(),
        ...selectionProps,
      };
    }

    const intervalLabel = formatPlannedPaymentInterval(item);
    const outstanding = item.outstandingJournalId
      ? activity?.find(
          journal => journal.id === item.outstandingJournalId && journal.status === 'PLANNED',
        )
      : undefined;
    const occurrenceAmount = item.outstandingJournalId
      ? outstanding
        ? { amount: outstanding.totalAmount, currencyCode: outstanding.currencyCode }
        : undefined
      : { amount: item.amount, currencyCode: item.currencyCode };

    const { headerActions, onPost, onSkip } = buildPlannedPaymentDetailsActions(
      item,
      // Handlers read actionLock only when pressed, never during render.
      // eslint-disable-next-line react-hooks/refs
      {
        handleEdit,
        handleDelete,
        handlePostNow,
        handleSkip,
      },
      {
        isPrivacyMode,
        occurrence: occurrenceAmount,
        isBusy: !!pendingAction,
        isTargetUnavailable: isLoadingActivity || !!activityError,
      },
    );

    const onToggleStatus =
      item.status === PlannedPaymentStatus.COMPLETED ? undefined : handleToggleStatus;

    return {
      theme,
      isLoading,
      isMissing,
      onBack: () => AppNavigation.back(),

      amount: item.amount,
      currencyCode: item.currencyCode,
      nameText: item.name,
      status: item.status,

      intervalLabel,
      nextOccurrenceText:
        item.nextDueOccurrence === undefined
          ? AppConfig.strings.plannedPayments.noUpcomingOccurrence
          : new Date(item.nextDueOccurrence).toLocaleDateString(),
      isAutoPost: item.isAutoPost,
      description: item.description,
      startDateText: formatDate(item.startDate),
      endDateText:
        item.endDate == null
          ? AppConfig.strings.plannedDetailRedesign.noEndDate
          : formatDate(item.endDate),
      occurrenceAmount,
      outstandingJournalId: outstanding?.id,
      activitySummary: activity ? summarizePlannedPaymentActivity(activity, getNow()) : undefined,
      nextOccurrences: activity ? getNextPlannedPaymentOccurrences(item, activity, 5) : undefined,
      nextOccurrenceDate: item.nextDueOccurrence,
      showcasedOccurrenceDate: outstanding?.journalDate ?? item.nextDueOccurrence,
      remainingOccurrenceCount: countRemainingPlannedOccurrences(
        item.nextOccurrence,
        item.endDate,
        item,
      ),
      endTimestamp: item.endDate,
      pausedSinceDate:
        item.status === PlannedPaymentStatus.PAUSED
          ? findPausedAtFromAudit(statusAudit)
          : undefined,
      firstRecordedDate: activity ? findFirstRecordedDate(activity) : undefined,
      reversalJournalIds: activity
        ? new Set(
            activity.filter(journal => !!journal.originalJournalId).map(journal => journal.id),
          )
        : undefined,
      isLoadingActivity,
      isLoadingHistory,
      activityError: activityError
        ? 'Could not load payment activity.'
        : !isLoadingActivity && item.outstandingJournalId && !outstanding
          ? 'The next occurrence is unavailable. Refresh payment activity.'
          : undefined,
      onRetryActivity: retryActivity,
      pendingAction,
      actionError,

      // Account flow
      fromAccount,
      toAccount,

      history,
      hasMore,
      isLoadingMore,
      onLoadMore: loadMore,

      headerActions,
      onPost,
      onSkip,
      onToggleStatus,

      ...selectionProps,
    };
  }, [
    item,
    history,
    activity,
    statusAudit,
    isLoadingActivity,
    isLoadingHistory,
    activityError,
    retryActivity,
    pendingAction,
    actionError,
    hasMore,
    isLoadingMore,
    loadMore,
    isLoading,
    theme,
    fromAccount,
    toAccount,
    handleEdit,
    handleDelete,
    handleToggleStatus,
    handlePostNow,
    handleSkip,
    isMissing,
    pDesc,
    pAmount,
    pCurrency,
    pDate,
    isLoadingVisible,
    isPrivacyMode,
    selectionProps,
  ]);
}
