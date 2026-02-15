import Account, { AccountType } from '@/src/data/models/Account';
import { useAccountActions, useAccountBalances, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, LayoutAnimation } from 'react-native';

export interface ManageHierarchyViewModel {
    accounts: Account[];
    balancesByAccountId: Map<string, { transactionCount?: number; directTransactionCount?: number }>;
    selectedAccountId: string | null;
    selectedAccount: Account | undefined;
    collapsedCategories: Set<string>;
    expandedAccountIds: Set<string>;
    accountsByParent: Map<string | null, Account[]>;
    visibleRootAccountsByCategory: Record<string, Account[]>;
    canSelectedAccountBeParent: boolean;
    addChildCandidates: Account[];
    parentCandidates: Account[];
    onCreateParent: () => void;
    onSelectAccount: (accountId: string | null) => void;
    onToggleExpand: (accountId: string) => void;
    onToggleCategory: (category: string) => void;
    onAssignParent: (accountId: string, parentId: string | null) => Promise<void>;
    onAddChild: (parentId: string, childId: string) => Promise<void>;
}

export function useManageHierarchyViewModel(): ManageHierarchyViewModel {
    const router = useRouter();
    const { accounts } = useAccounts();
    const { balancesByAccountId } = useAccountBalances(accounts);
    const { updateAccount } = useAccountActions();

    const params = useLocalSearchParams<{ accountId?: string }>();
    const initialFocusedId = params.accountId || null;

    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialFocusedId);
    const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

    // Auto-expand parents of the focused account
    useEffect(() => {
        if (!initialFocusedId || accounts.length === 0) return;

        const expanded = new Set<string>();
        let current = accounts.find((a: Account) => a.id === initialFocusedId);

        while (current?.parentAccountId) {
            expanded.add(current.parentAccountId);
            const parentId = current.parentAccountId;
            current = accounts.find((a: Account) => a.id === parentId);
        }

        if (expanded.size > 0) {
            setExpandedAccountIds(prev => new Set([...prev, ...expanded]));
        }

        // Ensure category is expanded
        const focusedAccount = accounts.find((a: Account) => a.id === initialFocusedId);
        if (focusedAccount) {
            setCollapsedCategories(prev => {
                const next = new Set(prev);
                next.delete(focusedAccount.accountType);
                return next;
            });
        }
    }, [initialFocusedId, accounts]);

    const accountsByParent = useMemo(() => {
        const groups = new Map<string | null, Account[]>();
        accounts.forEach((account: Account) => {
            const parentId = account.parentAccountId || null;
            if (!groups.has(parentId)) {
                groups.set(parentId, []);
            }
            groups.get(parentId)!.push(account);
        });
        return groups;
    }, [accounts]);

    const rootAccounts = useMemo(() => accounts.filter((account: Account) => !account.parentAccountId), [accounts]);

    const visibleRootAccountsByCategory = useMemo(() => {
        const groups: Record<string, Account[]> = {
            [AccountType.ASSET]: [],
            [AccountType.LIABILITY]: [],
            [AccountType.EQUITY]: [],
            [AccountType.INCOME]: [],
            [AccountType.EXPENSE]: [],
        };

        rootAccounts.forEach((account: Account) => {
            const children = accountsByParent.get(account.id) || [];
            const balance = balancesByAccountId.get(account.id);
            const hasDirectTransactions = (balance?.directTransactionCount || 0) > 0;
            const hasHierarchicalTransactions = (balance?.transactionCount || 0) > 0;

            if (children.length > 0 || !hasDirectTransactions) {
                groups[account.accountType].push(account);
            }
        });

        return groups;
    }, [accountsByParent, balancesByAccountId, rootAccounts]);

    const selectedAccount = useMemo(
        () => accounts.find((account) => account.id === selectedAccountId),
        [accounts, selectedAccountId]
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

        return accounts.filter((account: Account) => {
            const isOwnParent = account.id === selectedAccount.id;
            const isCurrentParent = account.id === selectedAccount.parentAccountId;
            const isDescendant = descendantIds.has(account.id);
            const isAlreadyChild = account.parentAccountId === selectedAccount.id;
            const sameType = account.accountType === selectedAccount.accountType;
            return !isOwnParent && !isCurrentParent && !isDescendant && !isAlreadyChild && sameType;
        });
    }, [accounts, selectedAccount, descendantIds]);

    const parentCandidates = useMemo(() => {
        if (!selectedAccount) return [];

        return accounts.filter((account) => {
            const isDescendant = descendantIds.has(account.id);
            const isCurrentParent = account.id === selectedAccount.parentAccountId;
            const balance = balancesByAccountId.get(account.id);
            const isSameAccount = account.id === selectedAccount.id;
            const canTakeChild = (balance?.directTransactionCount || 0) === 0;
            const sameType = account.accountType === selectedAccount.accountType;
            return !isSameAccount && !isCurrentParent && !isDescendant && canTakeChild && sameType;
        });
    }, [accounts, balancesByAccountId, selectedAccount, descendantIds]);

    const onToggleExpand = useCallback((accountId: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedAccountIds((prev) => {
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

    const onAssignParent = useCallback(async (accountId: string, parentId: string | null) => {
        const account = accounts.find((candidate: Account) => candidate.id === accountId);
        if (!account) return;

        try {
            await updateAccount(account, { parentAccountId: parentId });
            if (parentId) {
                setExpandedAccountIds((prev) => new Set([...prev, parentId]));
            }
        } catch (error: any) {
            logger.error('[ManageHierarchy] updateAccount failed', error);
            Alert.alert('Move Failed', error.message || 'An unexpected error occurred.');
        }

        setSelectedAccountId(null);
    }, [accounts, updateAccount]);

    const onAddChild = useCallback(async (parentId: string, childId: string) => {
        const childAccount = accounts.find((candidate: Account) => candidate.id === childId);
        if (!childAccount) return;

        try {
            await updateAccount(childAccount, { parentAccountId: parentId });
            setExpandedAccountIds((prev) => new Set([...prev, parentId]));
        } catch (error: any) {
            logger.error('[ManageHierarchy] handleAddChild failed', error);
            Alert.alert('Move Failed', error.message || 'An unexpected error occurred.');
        }

        setSelectedAccountId(null);
    }, [accounts, updateAccount]);

    const onCreateParent = useCallback(() => {
        router.push('/account-creation');
    }, [router]);

    const onSelectAccount = useCallback((accountId: string | null) => {
        setSelectedAccountId(accountId);
    }, []);

    return {
        accounts,
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
