import Account from '@/src/data/models/Account';
import {
  collectDescendantIds,
  getAddChildCandidates,
  getParentCandidates,
  getVisibleRootAccountsByCategory,
  groupAccountsByParent,
} from '@/src/features/accounts/helpers/hierarchyHelpers';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { useAccountBalances, useAccounts } from '@/src/features/accounts/hooks/useAccounts';

import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { AccountId } from '@/src/types/domain';
import { toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutAnimation } from 'react-native';

export interface ManageHierarchyViewModel {
  accounts: Account[];
  balancesByAccountId: Map<string, { transactionCount?: number; directTransactionCount?: number }>;
  selectedAccountId: AccountId | null;
  selectedAccount: Account | undefined;
  addChildParentId: AccountId | null;
  collapsedCategories: Set<string>;
  expandedAccountIds: Set<string>;
  accountsByParent: Map<AccountId | null, Account[]>;
  visibleRootAccountsByCategory: Record<string, Account[]>;
  addChildCandidates: Account[];
  parentCandidates: Account[];
  onCreateParent: () => void;
  onSelectAccount: (accountId: AccountId | null) => void;
  onRequestAddChild: (parentId: AccountId) => void;
  onCloseAddChild: () => void;
  onToggleExpand: (accountId: AccountId) => void;
  onToggleCategory: (category: string) => void;
  onAssignParent: (accountId: AccountId, parentId: AccountId | null) => Promise<void>;
  onAddChild: (childId: AccountId) => Promise<void>;
}

export function useManageHierarchyViewModel(): ManageHierarchyViewModel {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const { accounts } = useAccounts(workplaceId);
  const { balancesByAccountId } = useAccountBalances(workplaceId, accounts, defaultCurrencyCode);
  const { updateAccount } = useAccountActions(workplaceId);

  const params = useLocalSearchParams<{
    accountId?: AccountId;
    filterMode?: 'accounts' | 'categories';
  }>();
  const initialFocusedId = params.accountId || null;
  const filterMode = params.filterMode || 'accounts';

  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | null>(null);
  const [addChildParentId, setAddChildParentId] = useState<AccountId | null>(null);
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Filter accounts list to only match the current workspace mode
  const filteredAccounts = useMemo(() => {
    if (filterMode === 'categories') {
      return accounts.filter(a => a.accountType === 'INCOME' || a.accountType === 'EXPENSE');
    } else {
      return accounts.filter(a => a.accountType !== 'INCOME' && a.accountType !== 'EXPENSE');
    }
  }, [accounts, filterMode]);

  // Auto-expand parents of the focused account
  useEffect(() => {
    if (!initialFocusedId || filteredAccounts.length === 0) return;

    const expanded = new Set<string>();
    let current = filteredAccounts.find((a: Account) => a.id === initialFocusedId);

    while (current?.parentAccountId) {
      expanded.add(current.parentAccountId);
      const parentId = current.parentAccountId;
      current = filteredAccounts.find((a: Account) => a.id === parentId);
    }

    if (expanded.size > 0) {
      setTimeout(() => setExpandedAccountIds(prev => new Set([...prev, ...expanded])), 0);
    }

    // Ensure category is expanded
    const focusedAccount = filteredAccounts.find((a: Account) => a.id === initialFocusedId);
    if (focusedAccount) {
      setTimeout(
        () =>
          setCollapsedCategories(prev => {
            const next = new Set(prev);
            next.delete(focusedAccount.accountType);
            return next;
          }),
        0,
      );
    }
  }, [initialFocusedId, filteredAccounts]);

  const accountsByParent = useMemo(() => {
    return groupAccountsByParent(filteredAccounts);
  }, [filteredAccounts]);

  const visibleRootAccountsByCategory = useMemo(() => {
    return getVisibleRootAccountsByCategory(
      filteredAccounts,
      accountsByParent,
      balancesByAccountId,
    );
  }, [accountsByParent, balancesByAccountId, filteredAccounts]);

  const selectedAccount = useMemo(
    () => filteredAccounts.find(account => account.id === selectedAccountId),
    [filteredAccounts, selectedAccountId],
  );

  const addChildParent = useMemo(
    () => filteredAccounts.find(account => account.id === addChildParentId),
    [filteredAccounts, addChildParentId],
  );

  const moveDescendantIds = useMemo(() => {
    return collectDescendantIds(accountsByParent, selectedAccountId);
  }, [accountsByParent, selectedAccountId]);

  const addChildDescendantIds = useMemo(() => {
    return collectDescendantIds(accountsByParent, addChildParentId);
  }, [accountsByParent, addChildParentId]);

  const addChildCandidates = useMemo(() => {
    return getAddChildCandidates(filteredAccounts, addChildParent, addChildDescendantIds);
  }, [filteredAccounts, addChildParent, addChildDescendantIds]);

  const parentCandidates = useMemo(() => {
    return getParentCandidates(
      filteredAccounts,
      selectedAccount,
      moveDescendantIds,
      balancesByAccountId,
    );
  }, [filteredAccounts, balancesByAccountId, selectedAccount, moveDescendantIds]);

  const onToggleExpand = useCallback((accountId: AccountId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedAccountIds(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  const onToggleCategory = useCallback((category: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedCategories((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const onAssignParent = useCallback(
    async (accountId: AccountId, parentId: AccountId | null) => {
      const account = filteredAccounts.find((candidate: Account) => candidate.id === accountId);
      if (!account) {
        toast.error('Account not found');
        return;
      }

      try {
        await updateAccount(account, { parentAccountId: parentId });
        if (parentId) {
          setExpandedAccountIds(prev => new Set([...prev, parentId]));
        }
        setSelectedAccountId(null);
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Move failed');
      }
    },
    [filteredAccounts, updateAccount],
  );

  const onAddChild = useCallback(
    async (childId: AccountId) => {
      const parentId = addChildParentId;
      if (!parentId) return;

      const childAccount = filteredAccounts.find((candidate: Account) => candidate.id === childId);
      if (!childAccount) {
        toast.error('Account not found');
        return;
      }

      setAddChildParentId(null);

      try {
        await updateAccount(childAccount, { parentAccountId: parentId });
        setExpandedAccountIds(prev => new Set([...prev, parentId]));
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Failed to add child');
      }
    },
    [addChildParentId, filteredAccounts, updateAccount],
  );

  const onCreateParent = useCallback(() => {
    if (filterMode === 'categories') {
      AppNavigation.toCategoryCreation();
    } else {
      AppNavigation.toAccountCreation();
    }
  }, [filterMode]);

  const onSelectAccount = useCallback((accountId: AccountId | null) => {
    setAddChildParentId(null);
    setSelectedAccountId(accountId);
  }, []);

  const onRequestAddChild = useCallback((parentId: AccountId) => {
    setSelectedAccountId(null);
    setAddChildParentId(parentId);
  }, []);

  const onCloseAddChild = useCallback(() => {
    setAddChildParentId(null);
  }, []);

  return {
    accounts: filteredAccounts,
    balancesByAccountId,
    selectedAccountId,
    selectedAccount,
    addChildParentId,
    collapsedCategories,
    expandedAccountIds,
    accountsByParent,
    visibleRootAccountsByCategory,
    addChildCandidates,
    parentCandidates,
    onCreateParent,
    onSelectAccount,
    onRequestAddChild,
    onCloseAddChild,
    onToggleExpand,
    onToggleCategory,
    onAssignParent,
    onAddChild,
  };
}
