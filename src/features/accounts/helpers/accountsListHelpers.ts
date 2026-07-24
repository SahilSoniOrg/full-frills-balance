import Account, { AccountType } from '@/src/data/models/Account';
import { AccountSectionViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { AccountId } from '@/src/types/domain';
import { getCurrentMonthRange, getLastNRange } from '@/src/utils/dateUtils';

export type AccountsListInflowPeriod = 'overall' | 'month' | '30days';
export type AccountsListTab = 'accounts' | 'categories';

export function resolveInflowReportDateRange(
  period: AccountsListInflowPeriod,
): { startDate: number; endDate: number } | null {
  if (period === 'overall') return null;
  if (period === 'month') return getCurrentMonthRange();
  return getLastNRange(30, 'days');
}

export function filterAccountsBySearch<T extends { name: string }>(
  accounts: T[],
  searchQuery: string,
): T[] {
  if (!searchQuery) return accounts;
  const lowercaseQuery = searchQuery.toLowerCase();
  return accounts.filter(a => a.name.toLowerCase().includes(lowercaseQuery));
}

export function isCategoryAccount(account: Pick<Account, 'accountType'>): boolean {
  return account.accountType === AccountType.INCOME || account.accountType === AccountType.EXPENSE;
}

export function filterAccountsForListTab<T extends Pick<Account, 'accountType'>>(
  accounts: T[],
  activeTab: AccountsListTab,
): T[] {
  return accounts.filter(a => {
    const isCategory = isCategoryAccount(a);
    return activeTab === 'categories' ? isCategory : !isCategory;
  });
}

const ACCOUNT_TAB_SECTION_TYPES = [
  AccountType.ASSET,
  AccountType.LIABILITY,
  AccountType.EQUITY,
] as const;

const CATEGORY_TAB_SECTION_TYPES = [AccountType.INCOME, AccountType.EXPENSE] as const;

export function filterAccountSectionsForTab(
  sections: AccountSectionViewModel[],
  activeTab: AccountsListTab,
): AccountSectionViewModel[] {
  if (activeTab === 'accounts') {
    return sections.filter(
      s =>
        !s.type ||
        ACCOUNT_TAB_SECTION_TYPES.includes(s.type as (typeof ACCOUNT_TAB_SECTION_TYPES)[number]),
    );
  }
  return sections.filter(
    s =>
      s.type &&
      CATEGORY_TAB_SECTION_TYPES.includes(s.type as (typeof CATEGORY_TAB_SECTION_TYPES)[number]),
  );
}

export type AccountListPressAction = 'expand' | 'navigate';

export function resolveAccountListPressAction(
  accountId: AccountId,
  accounts: Pick<Account, 'id' | 'parentAccountId'>[],
  expandedAccountIds: Set<string>,
): AccountListPressAction {
  const hasChildren = accounts.some(a => a.parentAccountId === accountId);
  const isExpanded = expandedAccountIds.has(accountId);
  if (hasChildren && !isExpanded) return 'expand';
  return 'navigate';
}

export function resolveInflowTotals(input: {
  inflowPeriod: AccountsListInflowPeriod;
  totalIncome: number;
  totalExpense: number;
  periodTotals: { income: number; expense: number } | null;
}): { inflowIncome: number; inflowExpense: number } {
  if (input.inflowPeriod === 'overall') {
    return { inflowIncome: input.totalIncome, inflowExpense: input.totalExpense };
  }
  return {
    inflowIncome: input.periodTotals?.income || 0,
    inflowExpense: input.periodTotals?.expense || 0,
  };
}
