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
import { useMemo } from 'react';

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

  const reconciledAt = useMemo(
    () => (reconciledAtMs != null ? new Date(reconciledAtMs) : null),
    [reconciledAtMs],
  );

  const journalItems = useMemo(
    () => injectReconciledMarkersIntoJournalList(journalList.items, reconciledAt),
    [journalList.items, reconciledAt],
  );

  const actionsVm = useAccountDetailsActions({
    accountId,
    account,
    accountType,
    isDeleted,
    dateRange,
    recoverAction,
    reconcileAccount,
  });

  return {
    accountId,
    accountType,
    isDeleted,
    reconciledAt,
    dateRange,
    currencyCode: balanceCurrency,
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
  };
}
