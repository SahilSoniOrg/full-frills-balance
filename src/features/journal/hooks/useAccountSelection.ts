import { useVisibleAccounts } from '@/src/contexts/ArchiveVisibilityScope';
import type { AccountFields as Account } from '@/src/types/domain';
import { AccountId, AccountType } from '@/src/types/domain';
import { getAccountSections, isBalanceSheetAccount } from '@/src/utils/accountCategory';
import { useCallback, useMemo, useState } from 'react';

export interface UseAccountSelectionOptions {
  accounts: Account[];
  pinnedAccountIds?: ReadonlySet<AccountId>;
}

/**
 * useAccountSelection - Shared logic for filtering accounts into leaf buckets.
 * Used by journal editors for source/destination account lists.
 */
export function useAccountSelection({
  accounts,
  pinnedAccountIds = new Set<AccountId>(),
}: UseAccountSelectionOptions) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const visibleAccounts = useVisibleAccounts(accounts, pinnedAccountIds);

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
    const parentIds = new Set(
      visibleAccounts.map(a => a.parentAccountId).filter(Boolean) as string[],
    );
    return visibleAccounts.filter(a => !parentIds.has(a.id));
  }, [visibleAccounts]);

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
