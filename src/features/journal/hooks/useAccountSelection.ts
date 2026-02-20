import Account, { AccountType } from '@/src/data/models/Account';
import { getAccountSections } from '@/src/utils/accountUtils';
import { useCallback, useMemo, useState } from 'react';

export interface UseAccountSelectionOptions {
    accounts: Account[];
    initialSelectedId?: string;
    onSelect?: (id: string) => void;
}

/**
 * useAccountSelection - Shared logic for filtering and selecting accounts.
 * Used by both modal selectors and inline tile lists.
 */
export function useAccountSelection({ accounts, initialSelectedId, onSelect }: UseAccountSelectionOptions) {
    const [selectedId, setSelectedId] = useState(initialSelectedId || '');
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    const handleSelect = useCallback((id: string) => {
        setSelectedId(id);
        onSelect?.(id);
    }, [onSelect]);

    const toggleSection = useCallback((title: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(title)) {
                next.delete(title);
            } else {
                next.add(title);
            }
            return next;
        });
    }, []);

    const leafAccounts = useMemo(() => {
        const parentIds = new Set(accounts.map(a => a.parentAccountId).filter(Boolean) as string[]);
        return accounts.filter(a => !parentIds.has(a.id));
    }, [accounts]);

    const sections = useMemo(() => {
        return getAccountSections(leafAccounts);
    }, [leafAccounts]);

    const transactionAccounts = useMemo(() => {
        return leafAccounts.filter(a => a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY);
    }, [leafAccounts]);

    const expenseAccounts = useMemo(() => leafAccounts.filter(a => a.accountType === AccountType.EXPENSE), [leafAccounts]);
    const incomeAccounts = useMemo(() => leafAccounts.filter(a => a.accountType === AccountType.INCOME), [leafAccounts]);

    return {
        selectedId,
        setSelectedId,
        handleSelect,
        sections,
        collapsedSections,
        toggleSection,
        transactionAccounts,
        expenseAccounts,
        incomeAccounts,
    };
}
