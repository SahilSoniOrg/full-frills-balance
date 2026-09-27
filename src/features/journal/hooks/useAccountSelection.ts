import { useVisibleAccounts } from '@/src/contexts/ArchiveVisibilityScope';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { isBalanceSheetAccount } from '@/src/utils/accountCategory';
import { useMemo } from 'react';

export interface UseAccountSelectionOptions {
  accounts: AccountFields[];
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
  const visibleAccounts = useVisibleAccounts(accounts, pinnedAccountIds);

  const leafAccounts = useMemo(() => {
    const parentIds = new Set(
      visibleAccounts.map(a => a.parentAccountId).filter(Boolean) as string[],
    );
    return visibleAccounts.filter(a => !parentIds.has(a.id));
  }, [visibleAccounts]);

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
    transactionAccounts,
    expenseAccounts,
    incomeAccounts,
    leafAccounts,
  };
}
