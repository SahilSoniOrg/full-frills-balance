import Account from '@/src/data/models/Account';
import {
  useAccountActions,
  useAccountBalances,
  useAccounts,
} from '@/src/features/accounts/hooks/useAccounts';
import { createAccountTypeRecord } from '@/src/utils/accountCategory';

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
  collapsedCategories: Set<string>;
  expandedAccountIds: Set<string>;
  accountsByParent: Map<AccountId | null, Account[]>;
  visibleRootAccountsByCategory: Record<string, Account[]>;
  canSelectedAccountBeParent: boolean;
  addChildCandidates: Account[];
  parentCandidates: Account[];
  onCreateParent: () => void;
  onSelectAccount: (accountId: AccountId | null) => void;
  onToggleExpand: (accountId: AccountId) => void;
  onToggleCategory: (category: string) => void;
  onAssignParent: (accountId: AccountId, parentId: AccountId | null) => Promise<void>;
  onAddChild: (parentId: AccountId, childId: AccountId) => Promise<void>;
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

  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | null>(initialFocusedId);
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
    const groups = new Map<AccountId | null, Account[]>();
    filteredAccounts.forEach((account: Account) => {
      const parentId = account.parentAccountId || null;
      if (!groups.has(parentId)) {
        groups.set(parentId, []);
      }
      groups.get(parentId)!.push(account);
    });
    return groups;
  }, [filteredAccounts]);

  const rootAccounts = useMemo(
    () => filteredAccounts.filter((account: Account) => !account.parentAccountId),
    [filteredAccounts],
  );

  const visibleRootAccountsByCategory = useMemo(() => {
    const groups = createAccountTypeRecord<Account[]>(() => []);

    rootAccounts.forEach((account: Account) => {
      const children = accountsByParent.get(account.id) || [];
      const balance = balancesByAccountId.get(account.id);
      const hasDirectTransactions = (balance?.directTransactionCount || 0) > 0;

      if (children.length > 0 || !hasDirectTransactions) {
        groups[account.accountType].push(account);
      }
    });

    return groups;
  }, [accountsByParent, balancesByAccountId, rootAccounts]);

  const selectedAccount = useMemo(
    () => filteredAccounts.find(account => account.id === selectedAccountId),
    [filteredAccounts, selectedAccountId],
  );

  const canSelectedAccountBeParent = useMemo(() => {
    if (!selectedAccountId) return false;
    return (balancesByAccountId.get(selectedAccountId)?.directTransactionCount || 0) === 0;
  }, [balancesByAccountId, selectedAccountId]);

  const descendantIds = useMemo(() => {
    if (!selectedAccountId) return new Set<string>();
    const ids = new Set<string>();
    const stack = [selectedAccountId];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      const children = accountsByParent.get(currentId) || [];
      children.forEach(child => {
        ids.add(child.id);
        stack.push(child.id);
      });
    }
    return ids;
  }, [accountsByParent, selectedAccountId]);

  const addChildCandidates = useMemo(() => {
    if (!selectedAccount) return [];

    return filteredAccounts.filter((account: Account) => {
      const isOwnParent = account.id === selectedAccount.id;
      const isCurrentParent = account.id === selectedAccount.parentAccountId;
      const isDescendant = descendantIds.has(account.id);
      const isAlreadyChild = account.parentAccountId === selectedAccount.id;
      const sameType = account.accountType === selectedAccount.accountType;
      return !isOwnParent && !isCurrentParent && !isDescendant && !isAlreadyChild && sameType;
    });
  }, [filteredAccounts, selectedAccount, descendantIds]);

  const parentCandidates = useMemo(() => {
    if (!selectedAccount) return [];

    return filteredAccounts.filter(account => {
      const isDescendant = descendantIds.has(account.id);
      const isCurrentParent = account.id === selectedAccount.parentAccountId;
      const balance = balancesByAccountId.get(account.id);
      const isSameAccount = account.id === selectedAccount.id;
      const canTakeChild = (balance?.directTransactionCount || 0) === 0;
      const sameType = account.accountType === selectedAccount.accountType;
      return !isSameAccount && !isCurrentParent && !isDescendant && canTakeChild && sameType;
    });
  }, [filteredAccounts, balancesByAccountId, selectedAccount, descendantIds]);

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
      if (!account) return;

      try {
        await updateAccount(account, { parentAccountId: parentId });
        if (parentId) {
          setExpandedAccountIds(prev => new Set([...prev, parentId]));
        }
      } catch (error: any) {
        toast.error(error.message || 'Move failed');
      }

      setSelectedAccountId(null);
    },
    [filteredAccounts, updateAccount],
  );

  const onAddChild = useCallback(
    async (parentId: AccountId, childId: AccountId) => {
      const childAccount = filteredAccounts.find((candidate: Account) => candidate.id === childId);
      if (!childAccount) return;

      try {
        await updateAccount(childAccount, { parentAccountId: parentId });
        setExpandedAccountIds(prev => new Set([...prev, parentId]));
      } catch (error: any) {
        toast.error(error.message || 'Move failed');
      }

      setSelectedAccountId(null);
    },
    [filteredAccounts, updateAccount],
  );

  const onCreateParent = useCallback(() => {
    if (filterMode === 'categories') {
      AppNavigation.toCategoryCreation();
    } else {
      AppNavigation.toAccountCreation();
    }
  }, [filterMode]);

  const onSelectAccount = useCallback((accountId: AccountId | null) => {
    setSelectedAccountId(accountId);
  }, []);

  return {
    accounts: filteredAccounts,
    balancesByAccountId,
    selectedAccountId,
    selectedAccount,
    collapsedCategories,
    expandedAccountIds,
    accountsByParent,
    visibleRootAccountsByCategory,
    canSelectedAccountBeParent,
    addChildCandidates,
    parentCandidates,
    onCreateParent,
    onSelectAccount,
    onToggleExpand,
    onToggleCategory,
    onAssignParent,
    onAddChild,
  };
}
