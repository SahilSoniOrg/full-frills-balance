import Account, { AccountType } from '@/src/data/models/Account';
import { useAccountActions, useAccountBalances, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { logger } from '@/src/utils/logger';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { LayoutAnimation } from 'react-native';

export interface ManageHierarchyViewModel {
    accounts: Account[];
    balancesByAccountId: Map<string, { transactionCount?: number }>;
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

    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set());
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

    const accountsByParent = useMemo(() => {
        const groups = new Map<string | null, Account[]>();
        accounts.forEach((account) => {
            const parentId = account.parentAccountId || null;
            if (!groups.has(parentId)) {
                groups.set(parentId, []);
            }
            groups.get(parentId)!.push(account);
        });
        return groups;
    }, [accounts]);

    const rootAccounts = useMemo(() => accounts.filter((account) => !account.parentAccountId), [accounts]);

    const visibleRootAccountsByCategory = useMemo(() => {
        const groups: Record<string, Account[]> = {
            [AccountType.ASSET]: [],
            [AccountType.LIABILITY]: [],
            [AccountType.EQUITY]: [],
            [AccountType.INCOME]: [],
            [AccountType.EXPENSE]: [],
        };

        rootAccounts.forEach((account) => {
            const children = accountsByParent.get(account.id) || [];
            const balance = balancesByAccountId.get(account.id);
            const hasTransactions = (balance?.transactionCount || 0) > 0;

            if (children.length > 0 || !hasTransactions) {
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
        return (balancesByAccountId.get(selectedAccountId)?.transactionCount || 0) === 0;
    }, [balancesByAccountId, selectedAccountId]);

    const addChildCandidates = useMemo(() => {
        if (!selectedAccount) return [];

        return accounts.filter((account) => {
            const isOwnParent = account.id === selectedAccount.id;
            const isRoot = !account.parentAccountId;
            const sameType = account.accountType === selectedAccount.accountType;
            return isRoot && !isOwnParent && sameType;
        });
    }, [accounts, selectedAccount]);

    const parentCandidates = useMemo(() => {
        if (!selectedAccount) return [];

        return accounts.filter((account) => {
            const balance = balancesByAccountId.get(account.id);
            const isSameAccount = account.id === selectedAccount.id;
            const canTakeChild = (balance?.transactionCount || 0) === 0;
            const sameType = account.accountType === selectedAccount.accountType;
            return !isSameAccount && canTakeChild && sameType;
        });
    }, [accounts, balancesByAccountId, selectedAccount]);

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
        setCollapsedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    }, []);

    const onAssignParent = useCallback(async (accountId: string, parentId: string | null) => {
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account) return;

        try {
            await updateAccount(account, { parentAccountId: parentId });
        } catch (error) {
            logger.error('[ManageHierarchy] updateAccount failed', error);
        }

        setSelectedAccountId(null);
    }, [accounts, updateAccount]);

    const onAddChild = useCallback(async (parentId: string, childId: string) => {
        const childAccount = accounts.find((candidate) => candidate.id === childId);
        if (!childAccount) return;

        try {
            await updateAccount(childAccount, { parentAccountId: parentId });
        } catch (error) {
            logger.error('[ManageHierarchy] handleAddChild failed', error);
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
