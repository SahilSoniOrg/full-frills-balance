import type { SelectionAction } from '@/src/components/shared/SelectionActionBar';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { ColorKey, Theme } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields } from '@/src/types/plainDtos';
import { useAccount } from '@/src/hooks/useAccounts';
import { useJournalsBulkOperations, type JournalListModalsProps } from '@/src/features/journal';
import { buildPlannedPaymentDetailsActions } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsActions';
import {
  formatPlannedPaymentInterval,
  presentPlannedPaymentDue,
} from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import { usePlannedPaymentDetails } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetails';
import { useSelection } from '@/src/hooks/useSelection';
import { useTheme } from '@/src/hooks/use-theme';
import { shareJournalEntries } from '@/src/services/sharing/JournalShareProvider';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalDisplayType, PlannedPaymentStatus } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';
import { getAccountTypeColorKey } from '@/src/utils/accountCategory';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { formatDate, getNow } from '@/src/utils/dateUtils';
import { ComponentVariant } from '@/src/utils/style-helpers';
import {
  getNextPlannedPaymentOccurrences,
  summarizePlannedPaymentActivity,
  type PlannedPaymentActivitySummary,
  type PlannedPaymentNextOccurrence,
} from '@/src/services/planned-payment/plannedPaymentDetailService';
import type { Money } from '@/src/types/domainReadModels';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';

export interface PlannedPaymentDetailsViewModel {
  theme: Theme;
  isLoading: boolean;
  isMissing: boolean;
  isPreview?: boolean;
  onBack: () => void;

  title?: string;
  amount?: number | null;
  currencyCode?: string;
  nameText?: string;
  status?: PlannedPaymentStatus;
  statusText?: string;
  statusVariant?: 'success' | 'default';
  typeLabel?: string;
  typeColorKey?: ColorKey;
  iconName?: IconName;
  displayType?: JournalDisplayType;

  intervalLabel?: string;
  nextOccurrenceText?: string;
  isAutoPost?: boolean;
  description?: string;
  startDateText?: string;
  endDateText?: string;
  dueLabel?: string;
  dueColor?: ComponentVariant;
  scheduleHelpText?: string;
  occurrenceAmount?: Money;
  outstandingJournalId?: JournalId;
  nextOccurrences?: PlannedPaymentNextOccurrence[];
  activitySummary?: PlannedPaymentActivitySummary;
  isLoadingActivity?: boolean;
  isLoadingHistory?: boolean;
  activityError?: string;
  onRetryActivity?: () => void;
  pendingAction?: 'record' | 'skip' | 'toggle' | 'delete' | null;
  actionError?: string | null;

  fromAccount?: AccountFields | null;
  toAccount?: AccountFields | null;
  fromAccountColorKey?: string;
  toAccountColorKey?: string;

  history?: EnrichedJournal[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;

  rawAmount?: number;
  rawName?: string;

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

const STATUS_TEXT: Record<PlannedPaymentStatus, string> = {
  [PlannedPaymentStatus.ACTIVE]: 'Active',
  [PlannedPaymentStatus.PAUSED]: 'Paused',
  [PlannedPaymentStatus.COMPLETED]: 'Completed',
};

export function usePlannedPaymentDetailsViewModel(id: string): PlannedPaymentDetailsViewModel {
  const { theme } = useTheme();
  const { workplaceId } = useWorkplace();
  const isPrivacyMode = useEffectivePrivacyMode();
  const params = useLocalSearchParams();

  // Initial Data Injection: Extract preview data from params
  const pDesc = params.pDesc as string;
  const pAmount = params.pAmount as string;
  const pCurrency = params.pCurrency as string;
  const pDate = params.pDate as string;

  const {
    item,
    history,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    handleEdit,
    handleDelete,
    handleToggleStatus,
    handlePostNow,
    handleSkip,
    activity,
    isLoadingActivity,
    isLoadingHistory,
    activityError,
    retryActivity,
    pendingAction,
    actionError,
  } = usePlannedPaymentDetails(id, workplaceId);

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
          title: 'Planned payment',
          amount: previewAmount !== null && Number.isFinite(previewAmount) ? previewAmount : null,
          currencyCode: pCurrency,
          nameText: pDesc,
          typeLabel: '',
          typeColorKey: 'primary',
          iconName: Icon.Document,
          nextOccurrenceText: pDate ? new Date(parseInt(pDate)).toLocaleDateString() : '...',
          isAutoPost: false,
          fromAccount: null,
          toAccount: null,
          fromAccountColorKey: 'textSecondary',
          toAccountColorKey: 'primary',
          history: [],
          rawAmount: previewAmount ?? 0,
          rawName: pDesc,
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

    const isIncome = item.flowDirection === 'inflow';
    const isTransfer = item.flowDirection === 'transfer' || item.flowDirection === 'unknown';
    const displayType = isTransfer
      ? JournalDisplayType.TRANSFER
      : isIncome
        ? JournalDisplayType.INCOME
        : JournalDisplayType.EXPENSE;

    const typeColorKey: ColorKey = isIncome ? 'income' : isTransfer ? 'transfer' : 'expense';
    const typeLabel = isIncome
      ? 'Money in'
      : item.flowDirection === 'outflow'
        ? 'Money out'
        : item.flowDirection === 'transfer'
          ? 'Transfer'
          : 'Account movement';

    const intervalLabel = formatPlannedPaymentInterval(item);
    const due = presentPlannedPaymentDue(item, getNow());
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

      // Core Details
      title: 'Planned payment',
      amount: item.amount,
      currencyCode: item.currencyCode,
      nameText: item.name,
      status: item.status,
      statusText: STATUS_TEXT[item.status],
      statusVariant: item.status === 'ACTIVE' ? 'success' : 'default',
      typeLabel,
      typeColorKey,
      iconName:
        displayType === JournalDisplayType.INCOME
          ? Icon.ArrowUp
          : displayType === JournalDisplayType.EXPENSE
            ? Icon.ArrowDown
            : Icon.SwapHorizontal,
      displayType,

      // Recurrence Details
      intervalLabel,
      nextOccurrenceText:
        item.nextDueOccurrence === undefined
          ? AppConfig.strings.plannedPayments.noUpcomingOccurrence
          : new Date(item.nextDueOccurrence).toLocaleDateString(),
      isAutoPost: item.isAutoPost,
      description: item.description,
      startDateText: formatDate(item.startDate),
      endDateText: item.endDate == null ? 'No end date' : formatDate(item.endDate),
      dueLabel: due.label,
      dueColor: due.color,
      scheduleHelpText: due.helpText,
      occurrenceAmount,
      outstandingJournalId: outstanding?.id,
      activitySummary: activity ? summarizePlannedPaymentActivity(activity, getNow()) : undefined,
      nextOccurrences: activity ? getNextPlannedPaymentOccurrences(item, activity) : undefined,
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
      fromAccountColorKey: fromAccount
        ? getAccountTypeColorKey(fromAccount.accountType)
        : 'textSecondary',
      toAccountColorKey: toAccount ? getAccountTypeColorKey(toAccount.accountType) : typeColorKey,

      // History
      history,
      hasMore,
      isLoadingMore,
      onLoadMore: loadMore,

      rawAmount: item.amount,
      rawName: item.name,

      // Actions
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
