import Account from '@/src/data/models/Account';
import { createAccountTypeRecord } from '@/src/utils/accountCategory';
import { AccountId } from '@/src/types/domain';

export interface HierarchyBalanceSummary {
  directTransactionCount?: number;
}

export function groupAccountsByParent(accounts: Account[]): Map<AccountId | null, Account[]> {
  const groups = new Map<AccountId | null, Account[]>();
  accounts.forEach(account => {
    const parentId = account.parentAccountId || null;
    const siblings = groups.get(parentId) || [];
    siblings.push(account);
    groups.set(parentId, siblings);
  });
  return groups;
}

export function collectDescendantIds(
  accountsByParent: ReadonlyMap<AccountId | null, Account[]>,
  selectedAccountId: AccountId | null,
): Set<AccountId> {
  if (!selectedAccountId) return new Set();

  const descendants = new Set<AccountId>();
  const stack = [selectedAccountId];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    for (const child of accountsByParent.get(currentId) || []) {
      descendants.add(child.id);
      stack.push(child.id);
    }
  }
  return descendants;
}

export function getVisibleRootAccountsByCategory(
  accounts: Account[],
  accountsByParent: ReadonlyMap<AccountId | null, Account[]>,
  balancesByAccountId: ReadonlyMap<string, HierarchyBalanceSummary>,
) {
  const groups = createAccountTypeRecord<Account[]>(() => []);
  const rootAccounts = accounts.filter(account => !account.parentAccountId);

  rootAccounts.forEach(account => {
    const children = accountsByParent.get(account.id) || [];
    const balance = balancesByAccountId.get(account.id);
    const hasDirectTransactions = (balance?.directTransactionCount || 0) > 0;
    if (children.length > 0 || !hasDirectTransactions) {
      groups[account.accountType].push(account);
    }
  });

  return groups;
}

export function getAddChildCandidates(
  accounts: Account[],
  selectedAccount: Account | undefined,
  descendantIds: ReadonlySet<AccountId>,
): Account[] {
  if (!selectedAccount) return [];

  return accounts.filter(account => {
    const isOwnParent = account.id === selectedAccount.id;
    const isCurrentParent = account.id === selectedAccount.parentAccountId;
    const isDescendant = descendantIds.has(account.id);
    const isAlreadyChild = account.parentAccountId === selectedAccount.id;
    const sameType = account.accountType === selectedAccount.accountType;
    return !isOwnParent && !isCurrentParent && !isDescendant && !isAlreadyChild && sameType;
  });
}

export function getParentCandidates(
  accounts: Account[],
  selectedAccount: Account | undefined,
  descendantIds: ReadonlySet<AccountId>,
  balancesByAccountId: ReadonlyMap<string, HierarchyBalanceSummary>,
): Account[] {
  if (!selectedAccount) return [];

  return accounts.filter(account => {
    const isDescendant = descendantIds.has(account.id);
    const isCurrentParent = account.id === selectedAccount.parentAccountId;
    const balance = balancesByAccountId.get(account.id);
    const isSameAccount = account.id === selectedAccount.id;
    const canTakeChild = (balance?.directTransactionCount || 0) === 0;
    const sameType = account.accountType === selectedAccount.accountType;
    return !isSameAccount && !isCurrentParent && !isDescendant && canTakeChild && sameType;
  });
}
