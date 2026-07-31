import Account, { AccountType } from '@/src/data/models/Account';
import { getAccountSections, isBalanceSheetAccount } from '@/src/utils/accountCategory';
import { useCallback, useMemo, useState } from 'react';

export interface UseAccountSelectionOptions {
  accounts: Account[];
}

/**
 * useAccountSelection - Shared logic for filtering accounts into leaf buckets.
 * Used by journal editors for source/destination account lists.
 */
export function useAccountSelection({ accounts }: UseAccountSelectionOptions) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

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
    return leafAccounts.filter(a => isBalanceSheetAccount(a.accountType));
  }, [leafAccounts]);

  const expenseAccounts = useMemo(
    () => leafAccounts.filter(a => a.accountType === AccountType.EXPENSE),
    [leafAccounts],
  );
  const incomeAccounts = useMemo(
    () => leafAccounts.filter(a => a.accountType === AccountType.INCOME),
    [leafAccounts],
  );

  return {
    sections,
    collapsedSections,
    toggleSection,
    transactionAccounts,
    expenseAccounts,
    incomeAccounts,
    leafAccounts,
  };
}
