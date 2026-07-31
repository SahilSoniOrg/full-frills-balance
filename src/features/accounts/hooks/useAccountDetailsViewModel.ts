import { useUI } from '@/src/contexts/UIContext';
import {
  AccountDetailsViewModel,
  PeriodMetrics,
  SubAccountViewModel,
} from '@/src/features/accounts/hooks/details/accountDetailsViewModelTypes';
import { useAccountDetailsActions } from '@/src/features/accounts/hooks/details/useAccountDetailsActions';
import { useAccountDetailsData } from '@/src/features/accounts/hooks/details/useAccountDetailsData';
import { useAccountDetailsMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { useAccountHierarchyTree } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { useAccountTransactionFeed } from '@/src/features/accounts/hooks/details/useAccountTransactionFeed';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccounts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

export type { AccountDetailsViewModel, PeriodMetrics, SubAccountViewModel };

export function useAccountDetailsViewModel(): AccountDetailsViewModel {
  const { defaultShareFormat } = useUI();

  const {
    workplaceId,
    workplaceCurrency,
    account,
    balanceData,
    accounts,
    rawSubBalances,
    dashboardLoading,
    isAssetOrExpense,
    transactionCount,
    balanceCurrency,
    accountId,
    accountType,
    isDeleted,
    reconciledAt,
    dateRange,
    ...dataVm
  } = useAccountDetailsData();

  const {
    deleteAccount,
    recoverAccount: recoverAction,
    reconcileAccount,
    mergeAccounts,
  } = useAccountActions(workplaceId);

  const { precision, ...metricsVm } = useAccountDetailsMetrics({
    accountId,
    workplaceId,
    accountType,
    isAssetOrExpense,
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

  const { transactions, ...feedVm } = useAccountTransactionFeed({
    accountId,
    workplaceId,
    dateRange,
    balanceCurrency,
    precision,
    reconciledAt,
  });

  const actionsVm = useAccountDetailsActions({
    accountId,
    account,
    accounts,
    transactionCount,
    isDeleted,
    workplaceCurrency,
    defaultShareFormat,
    deleteAccount,
    recoverAction,
    reconcileAccount,
    mergeAccounts,
    transactions,
    selectedIds: feedVm.selectedIds,
  });

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
    ...feedVm,
    ...actionsVm,
  };
}
