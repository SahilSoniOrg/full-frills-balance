import type { SelectionAction } from '@/src/components/common/SelectionActionBar';
import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig } from '@/src/constants';
import { ColorKey, Theme } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields } from '@/src/types/domain';
import { useAccount } from '@/src/features/accounts';
import { useJournalsBulkOperations, type JournalListModalsProps } from '@/src/features/journal';
import { buildPlannedPaymentDetailsActions } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsActions';
import { formatPlannedPaymentInterval } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import { usePlannedPaymentDetails } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetails';
import { useSelection } from '@/src/hooks/useSelection';
import { useTheme } from '@/src/hooks/use-theme';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { JournalShareProvider } from '@/src/services/sharing/JournalShareProvider';
import { sharingService } from '@/src/services/SharingService';
import { EnrichedJournal, JournalDisplayType, JournalId } from '@/src/types/domain';
import { getAccountTypeColorKey } from '@/src/utils/accountCategory';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';

export interface PlannedPaymentDetailsViewModel {
  theme: Theme;
  isLoading: boolean;
  isMissing: boolean;
  onBack: () => void;

  title?: string;
  amount?: number | null;
  currencyCode?: string;
  nameText?: string;
  statusLabel?: string;
  statusVariant?: 'success' | 'default';
  typeLabel?: string;
  typeColorKey?: ColorKey;
  iconName?: IconName;
  displayType?: JournalDisplayType;

  intervalLabel?: string;
  nextOccurrenceText?: string;
  isAutoPost?: boolean;

  fromAccount?: AccountFields | null;
  toAccount?: AccountFields | null;
  fromAccountColorKey?: string;
  toAccountColorKey?: string;

  history?: EnrichedJournal[];

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
    handleEdit,
    handleDelete,
    handleToggleStatus,
    handlePostNow,
    handleSkip,
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
      const provider = new JournalShareProvider(
        selectedJournals.map(j => ({
          id: j.id,
          date: j.journalDate,
          description: j.description || j.semanticLabel || 'Journal entry',
          amount: j.totalAmount,
          currencyCode: j.currencyCode,
          displayType: j.displayType,
        })),
        {
          title: `Transactions for ${item?.name || 'Planned Payment'}`,
          includeTime: true,
          sort: 'desc',
          showEmojis: true,
        },
      );
      await sharingService.share(provider);
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
          onBack: () => AppNavigation.back(),
          title: AppConfig.strings.plannedPayments.details.screenTitle,
          amount: previewAmount !== null && Number.isFinite(previewAmount) ? previewAmount : null,
          currencyCode: pCurrency,
          nameText: pDesc,
          statusLabel: '',
          typeLabel: '',
          typeColorKey: 'primary',
          iconName: 'document',
          nextOccurrenceText: pDate ? new Date(parseInt(pDate)).toLocaleDateString() : '...',
          isAutoPost: false,
          fromAccount: null,
          toAccount: null,
          fromAccountColorKey: 'textSecondary',
          toAccountColorKey: 'primary',
          history: [],
          rawAmount: previewAmount ?? 0,
          rawName: pDesc,
          headerActions: { onEdit: handleEdit, onDelete: () => {} },
          onPost: () => {},
          onSkip: () => {},
          onToggleStatus: handleToggleStatus,
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

    const isIncome = item.amount > 0 && fromAccount?.accountType === 'INCOME';
    const isTransfer =
      !!item.toAccountId &&
      toAccount?.accountType !== 'EXPENSE' &&
      toAccount?.accountType !== 'INCOME';
    const displayType = isTransfer
      ? JournalDisplayType.TRANSFER
      : isIncome
        ? JournalDisplayType.INCOME
        : JournalDisplayType.EXPENSE;

    const presentation = journalPresenter.getPresentation(displayType);
    const typeColorKey = presentation.colorKey as ColorKey;
    const typeLabel = presentation.label;

    const intervalLabel = formatPlannedPaymentInterval(item);

    const { headerActions, onPost, onSkip } = buildPlannedPaymentDetailsActions(
      item,
      {
        handleEdit,
        handleDelete,
        handlePostNow,
        handleSkip,
      },
      { isPrivacyMode },
    );

    const onToggleStatus = handleToggleStatus;

    return {
      theme,
      isLoading,
      isMissing,
      onBack: () => AppNavigation.back(),

      // Core Details
      title: AppConfig.strings.plannedPayments.details.screenTitle,
      amount: item.amount,
      currencyCode: item.currencyCode,
      nameText: item.name,
      statusLabel: item.status,
      statusVariant: item.status === 'ACTIVE' ? 'success' : 'default',
      typeLabel,
      typeColorKey,
      iconName:
        displayType === JournalDisplayType.INCOME
          ? 'arrowUp'
          : displayType === JournalDisplayType.EXPENSE
            ? 'arrowDown'
            : 'swapHorizontal',
      displayType,

      // Recurrence Details
      intervalLabel,
      nextOccurrenceText: new Date(item.nextOccurrence).toLocaleDateString(),
      isAutoPost: item.isAutoPost,

      // Account flow
      fromAccount,
      toAccount,
      fromAccountColorKey: fromAccount
        ? getAccountTypeColorKey(fromAccount.accountType)
        : 'textSecondary',
      toAccountColorKey: toAccount ? getAccountTypeColorKey(toAccount.accountType) : typeColorKey,

      // History
      history,

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
