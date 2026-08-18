import type { AccountFields as Account } from '@/src/types/domain';
import { AccountId } from '@/src/types/domain';
import { ACCOUNT_TYPE_ORDER } from '@/src/utils/accountCategory';

export type AccountReorderFilterMode = 'accounts' | 'categories';

/** Filter + sort live accounts into the reorder screen's read-only base list. */
export function buildSortedAccounts(
  accounts: Account[],
  filterMode: AccountReorderFilterMode,
): Account[] {
  const filtered = accounts.filter(a => {
    const isCategory = a.accountType === 'INCOME' || a.accountType === 'EXPENSE';
    return filterMode === 'categories' ? isCategory : !isCategory;
  });

  return [...filtered].sort((a, b) => {
    const typeRankA = ACCOUNT_TYPE_ORDER.indexOf(a.accountType);
    const typeRankB = ACCOUNT_TYPE_ORDER.indexOf(b.accountType);
    if (typeRankA !== typeRankB) return typeRankA - typeRankB;
    return (a.orderNum || 0) - (b.orderNum || 0);
  });
}

/**
 * Apply an optimistic id-order overlay over the live sorted list.
 * Missing ids are skipped; accounts that appear in source but not in pending
 * are appended in source order so observe ticks never drop rows.
 */
export function applyPendingOrder(
  baseSorted: Account[],
  pendingOrder: AccountId[] | null,
): Account[] {
  if (!pendingOrder || pendingOrder.length === 0) return baseSorted;

  const byId = new Map(baseSorted.map(a => [a.id as AccountId, a]));
  const result: Account[] = [];
  const used = new Set<AccountId>();

  for (const id of pendingOrder) {
    const account = byId.get(id);
    if (account) {
      result.push(account);
      used.add(id);
    }
  }

  for (const account of baseSorted) {
    const id = account.id as AccountId;
    if (!used.has(id)) {
      result.push(account);
    }
  }

  return result;
}

export function accountIdsMatch(a: AccountId[], b: AccountId[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

export function computeReorderMove(
  accounts: Account[],
  index: number,
  direction: 'up' | 'down',
): { nextAccounts: Account[]; item: Account; newOrderNum: number } | null {
  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= accounts.length) return null;

  // Prevent moving across account types
  if (accounts[index].accountType !== accounts[newIndex].accountType) return null;

  const nextAccounts = [...accounts];
  const item = nextAccounts[index];

  nextAccounts.splice(index, 1);
  nextAccounts.splice(newIndex, 0, item);

  const itemBefore = nextAccounts[newIndex - 1];
  const itemAfter = nextAccounts[newIndex + 1];
  const getOrder = (acc?: Account) => acc?.orderNum || 0;

  let newOrderNum = 0;
  if (
    itemBefore &&
    itemBefore.accountType === item.accountType &&
    itemAfter &&
    itemAfter.accountType === item.accountType
  ) {
    newOrderNum = (getOrder(itemBefore) + getOrder(itemAfter)) / 2;
  } else if (itemBefore && itemBefore.accountType === item.accountType) {
    newOrderNum = getOrder(itemBefore) + 1;
  } else if (itemAfter && itemAfter.accountType === item.accountType) {
    newOrderNum = getOrder(itemAfter) - 1;
  }

  return { nextAccounts, item, newOrderNum };
}
