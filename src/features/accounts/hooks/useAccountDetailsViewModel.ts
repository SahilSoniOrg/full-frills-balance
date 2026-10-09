import {
  AccountDetailsViewModel,
  PeriodMetrics,
  SubAccountViewModel,
} from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useAccountDetailsActions } from '@/src/features/accounts/hooks/details/useAccountDetailsActions';
import { useAccountDetailsData } from '@/src/features/accounts/hooks/details/useAccountDetailsData';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { useAccountHierarchyTree } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { useAccountArchiveAction } from '@/src/features/accounts/hooks/useAccountArchiveAction';
import { useAccountDeleteMergeActions } from '@/src/features/accounts/hooks/useAccountDeleteMergeActions';
import { accountDetailsCopy } from '@/src/features/accounts/helpers/accountFlowLabels';
import { buildAccountDetailsHeaderActions } from '@/src/features/accounts/helpers/buildAccountDetailsHeaderActions';
import { useTheme } from '@/src/hooks/use-theme';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { injectReconciledMarkersIntoJournalList } from '@/src/features/accounts/mappers/accountJournalListPresentation';
import { useJournalEntryList, useJournalsBulkOperations } from '@/src/features/journal';
import { createAccountTreeSnapshot, isUndeletedAccount } from '@/src/services/accounts/accountTree';
import { useMemo } from 'react';

export type { AccountDetailsViewModel, PeriodMetrics, SubAccountViewModel };

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
  const { theme } = useTheme();
  const data = useAccountDetailsData();
  const {
    workplaceId,
    workplaceCurrency,
    account,
    balanceData,
    accounts,
    rawSubBalances,
    dashboardLoading,
    balanceCurrency,
    accountId,
    accountType,
    isDeleted,
    reconciledAtMs,
    dateRange,
    accountName,
    accountSubtypeLabel,
    accountTypeVariant,
    accountIcon,
    accountColor,
    isArchived,
    balanceAmount,
    transactionCountText,
    isDatePickerVisible,
    showDatePicker,
    hideDatePicker: hidePicker,
    navigatePrevious,
    navigateNext,
    onDateSelect,
    periodFilter,
    unreconciledCount,
  } = data;

  const {
    recoverAccount: recoverAction,
    reconcileAccount,
    deleteAccount: deleteAccountAction,
    mergeAccounts,
    disbandGroup,
  } = useAccountActions(workplaceId);

  const accountTreeSnapshot = useMemo(() => createAccountTreeSnapshot(accounts), [accounts]);
  const accountDetailsScope = useMemo(() => {
    const descendantIdsSet = accountTreeSnapshot.getDescendants(accountId);
    const descendantIds = accounts
      .filter(account => descendantIdsSet.has(account.id))
      .filter(isUndeletedAccount)
      .map(account => account.id);
    return { accountIds: [accountId, ...descendantIds], descendantIds };
  }, [accountTreeSnapshot, accounts, accountId]);

  const metrics = useAccountDetailsMetrics({
    accountId,
    workplaceId,
    accountType,
    balanceCurrency,
    dateRange,
    balanceData,
    accountIds: accountDetailsScope.accountIds,
  });

  const hierarchy = useAccountHierarchyTree({
    accountId,
    account,
    treeSnapshot: accountTreeSnapshot,
    rawSubBalances,
    workplaceCurrency,
    dashboardLoading,
  });

  const viewer = useMemo(() => ({ accountId }), [accountId]);

  const journalList = useJournalEntryList({
    workplaceId,
    dateRange: dateRange ?? undefined,
    queryOptions: { accountIds: accountDetailsScope.accountIds },
    viewer,
    expandScopedLegs:
      accountDetailsScope.descendantIds.length > 0 ? accountDetailsScope.accountIds : undefined,
    shareTitle: `Entries for ${account?.name || 'Account'}`,
    paginationPolicy: 'default',
  });

  const bulkOperations = useJournalsBulkOperations({
    workplaceId,
    journals: journalList.journals,
    selection: journalList,
    onShareSelected: journalList.onShareSelected,
  });

  const journalItems = useMemo(
    () => injectReconciledMarkersIntoJournalList(journalList.items, reconciledAtMs),
    [journalList.items, reconciledAtMs],
  );

  const actions = useAccountDetailsActions({
    accountId,
    account,
    accountType,
    isDeleted,
    dateRange,
    recoverAction,
    reconcileAccount,
  });

  // Only offer management actions once the persisted account and its counts have loaded.
  const managementEnabled = !!account && !dashboardLoading && !isDeleted;
  const archive = useAccountArchiveAction({
    enabled: managementEnabled,
    workplaceId,
    accountId,
    account,
    accounts,
  });
  const deleteMerge = useAccountDeleteMergeActions({
    enabled: managementEnabled,
    accountId,
    account,
    accounts,
    tree: accountTreeSnapshot,
    directTransactionCount: balanceData?.directTransactionCount ?? 0,
    isDeleted,
    entityLabel: accountDetailsCopy(accountType).entity,
    deleteAccount: deleteAccountAction,
    recoverAction,
    mergeAccounts,
    disbandGroup,
  });
  const headerActions = useMemo(
    () =>
      buildAccountDetailsHeaderActions(
        {
          accountType,
          isDeleted,
          onRecover: actions.onRecover,
          onSearch: actions.onSearch,
          onEdit: actions.onEdit,
          managementActions: [...archive.actions, ...deleteMerge.actions],
        },
        theme,
      ),
    [
      accountType,
      isDeleted,
      actions.onRecover,
      actions.onSearch,
      actions.onEdit,
      archive.actions,
      deleteMerge.actions,
      theme,
    ],
  );

  const listHeader = useMemo(
    () => ({
      currencyCode: balanceCurrency,
      summary: {
        accountName,
        accountIcon,
        accountType,
        accountSubtypeLabel,
        accountTypeVariant,
        accountColor,
        isParent: hierarchy.isParent,
        ancestorPath: hierarchy.ancestorPath,
        onOpenAncestor: hierarchy.onOpenAncestor,
        isDeleted,
        isArchived,
        subAccountCount: hierarchy.subAccountCount,
        onShowSubAccounts: hierarchy.onShowSubAccounts,
        balanceAmount,
        secondaryBalances: metrics.secondaryBalances,
        transactionCountText,
        reconciledAtMs,
        onAuditPress: actions.onAuditPress,
        onReconcile: actions.onReconcile,
        unreconciledCount,
      },
      activity: {
        dateRange,
        onShowDatePicker: showDatePicker,
        onPreviousPeriod: navigatePrevious,
        onNextPeriod: navigateNext,
        chartData: metrics.chartData,
        rollingAverageData: metrics.rollingAverageData,
        xTicks: metrics.xTicks,
        periodMetrics: metrics.periodMetrics,
        previousPeriod: metrics.previousPeriod,
      },
    }),
    [
      reconciledAtMs,
      balanceCurrency,
      accountName,
      accountIcon,
      accountType,
      accountSubtypeLabel,
      accountTypeVariant,
      accountColor,
      hierarchy.isParent,
      hierarchy.ancestorPath,
      hierarchy.onOpenAncestor,
      hierarchy.subAccountCount,
      hierarchy.onShowSubAccounts,
      isDeleted,
      isArchived,
      balanceAmount,
      metrics.secondaryBalances,
      transactionCountText,
      actions.onAuditPress,
      dateRange,
      showDatePicker,
      navigatePrevious,
      navigateNext,
      metrics.chartData,
      metrics.rollingAverageData,
      metrics.xTicks,
      metrics.periodMetrics,
      metrics.previousPeriod,
      actions.onReconcile,
      unreconciledCount,
    ],
  );

  return {
    accountName,
    accountLoading: data.accountLoading,
    accountMissing: data.accountMissing,
    accountType,
    isParent: hierarchy.isParent,
    isDeleted,
    isArchived,
    headerActions,
    onAddPress: actions.onAddPress,
    onBack: actions.onBack,
    archiveCascadeModal: archive.archiveCascadeModal,
    mergePickerModal: deleteMerge.mergePickerModal,
    listHeader,
    isDatePickerVisible,
    hideDatePicker: hidePicker,
    periodFilter,
    onDateSelect,
    journalItems,
    journalsLoading: journalList.isLoading,
    journalsLoadingMore: journalList.isLoadingMore,
    onLoadMore: journalList.onEndReached,
    subAccounts: hierarchy.subAccounts,
    subAccountsLoading: hierarchy.subAccountsLoading,
    isSubAccountsModalVisible: hierarchy.isSubAccountsModalVisible,
    onHideSubAccounts: hierarchy.onHideSubAccounts,
    onOpenSubAccount: hierarchy.onOpenSubAccount,
    isReconcileModalVisible: actions.isReconcileModalVisible,
    setIsReconcileModalVisible: actions.setIsReconcileModalVisible,
    onConfirmReconcile: actions.onConfirmReconcile,
    balanceAmount,
    currencyCode: balanceCurrency,
    unreconciledCount,
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    selectionChrome: bulkOperations.selectionChrome,
    modals: bulkOperations.modals,
  };
}
