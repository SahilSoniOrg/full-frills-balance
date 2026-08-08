import { AccountId } from '@/src/types/domain';

export type HierarchyAccountLike = {
  id: AccountId | string;
  parentAccountId?: AccountId | string | null;
};

/** All descendant accounts under `parentId` (direct and nested). */
export function getAccountDescendants<T extends HierarchyAccountLike>(
  accounts: readonly T[],
  parentId: AccountId | string,
): T[] {
  const directChildren = accounts.filter(a => a.parentAccountId === parentId);
  const all: T[] = [...directChildren];
  for (const child of directChildren) {
    all.push(...getAccountDescendants(accounts, child.id));
  }
  return all;
}
