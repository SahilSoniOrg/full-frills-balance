import {
  AccountDetailsViewModel,
  PeriodMetrics,
  SubAccountViewModel,
} from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useAccountDetailsActions } from '@/src/features/accounts/hooks/details/useAccountDetailsActions';
import { useAccountDetailsData } from '@/src/features/accounts/hooks/details/useAccountDetailsData';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { useAccountHierarchyTree } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { injectReconciledMarkersIntoJournalList } from '@/src/features/accounts/mappers/accountJournalListPresentation';
import { useJournalEntryList } from '@/src/features/journal';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { AppNavigation } from '@/src/utils/navigation';
import { isCategoryAccountType } from '@/src/utils/accountCategory';
import { useCallback, useMemo } from 'react';

export type { AccountDetailsViewModel, PeriodMetrics, SubAccountViewModel };

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
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
    reconciledAt,
    dateRange,
    ...dataVm
  } = useAccountDetailsData();

  const { recoverAccount: recoverAction, reconcileAccount } = useAccountActions(workplaceId);

  const { precision, ...metricsVm } = useAccountDetailsMetrics({
    accountId,
    workplaceId,
    accountType,
    balanceCurrency,
    dateRange,
    balanceData,
  });

  const hierarchyVm = useAccountHierarchyTree({
    accountId,
    account,
    accounts,
    rawSubBalances,
    workplaceCurrency,
    dashboardLoading,
  });

  const viewer = useMemo(() => ({ accountId }), [accountId]);

  const journalList = useJournalEntryList({
    workplaceId,
    dateRange: dateRange ?? undefined,
    queryOptions: { accountIds: [accountId] },
    viewer,
    shareTitle: `Journal entries for ${account?.name || 'Account'}`,
    paginationPolicy: 'default',
  });

  const journalItems = useMemo(
    () =>
      injectReconciledMarkersIntoJournalList(
        journalList.items,
        reconciledAtMs != null ? new Date(reconciledAtMs) : null,
      ),
    [journalList.items, reconciledAtMs],
  );

  const actionsVm = useAccountDetailsActions({
    accountId,
    account,
    isDeleted,
    recoverAction,
    reconcileAccount,
  });

  const onReconcilePress =
    !isDeleted && !isCategoryAccountType(accountType) ? actionsVm.onReconcile : undefined;

  const onBack = useCallback(() => AppNavigation.back(), []);
  const onAuditPress = useCallback(
    () => AppNavigation.toAuditLog({ entityType: 'account', entityId: accountId }),
    [accountId],
  );
  const onAddPress = useCallback(
    () => AppNavigation.toJournalEntry({ sourceAccountId: accountId }),
    [accountId],
  );

  return {
    accountId,
    accountType,
    isDeleted,
    reconciledAt,
    dateRange,
    currencyCode: balanceCurrency,
    onBack,
    onAuditPress,
    onAddPress,
    ...dataVm,
    ...metricsVm,
    ...hierarchyVm,
    journalItems,
    journalsLoading: journalList.isLoading,
    journalsLoadingMore: journalList.isLoadingMore,
    onLoadMore: journalList.onEndReached,
    selectedIds: journalList.selectedIds,
    isSelectionModeActive: journalList.isSelectionModeActive,
    onLongPressItem: journalList.onLongPressItem,
    toggleSelection: journalList.toggleSelection,
    selectAll: journalList.selectAll,
    clearItems: journalList.clearItems,
    exitSelectionMode: journalList.exitSelectionMode,
    onShareSelected: journalList.onShareSelected,
    setSelectedIds: journalList.setSelectedIds,
    ...actionsVm,
    onReconcilePress,
  };
}
