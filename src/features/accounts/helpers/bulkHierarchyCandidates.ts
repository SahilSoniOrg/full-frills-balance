import { IconName } from '@/src/components/core';
import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';

export interface HierarchyCandidateAccount {
  id: AccountId;
  name: string;
  icon?: IconName;
  accountType: AccountType;
}

type HierarchyAccount = {
  id: AccountId;
  name: string;
  icon?: IconName;
  accountType: AccountType;
  parentAccountId?: AccountId | null;
};

export function getBulkHierarchyCandidates(
  accounts: HierarchyAccount[],
  selectedIds: ReadonlySet<AccountId>,
): HierarchyCandidateAccount[] {
  if (selectedIds.size === 0) return [];
  const selected = accounts.filter(account => selectedIds.has(account.id));
  const selectedTypes = new Set(selected.map(account => account.accountType));
  if (selectedTypes.size !== 1) return [];
  const targetType = selected[0].accountType;

  const childrenByParent = new Map<AccountId, AccountId[]>();

  for (const account of accounts) {
    if (!account.parentAccountId) continue;
    const parentId = account.parentAccountId;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(account.id);
    childrenByParent.set(parentId, children);
  }

  const descendants = new Set<AccountId>();
  const pending = [...selectedIds];
  while (pending.length > 0) {
    const nextId = pending.pop();
    if (!nextId) break;
    const childIds = childrenByParent.get(nextId) ?? [];
    for (const childId of childIds) {
      if (!descendants.has(childId)) {
        descendants.add(childId);
        pending.push(childId);
      }
    }
  }

  return accounts
    .filter(
      account =>
        !selectedIds.has(account.id) &&
        !descendants.has(account.id) &&
        account.accountType === targetType,
    )
    .map(account => ({
      id: account.id,
      name: account.name,
      icon: account.icon,
      accountType: account.accountType,
    }));
}
