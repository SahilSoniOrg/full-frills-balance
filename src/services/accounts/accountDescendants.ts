import Account from '@/src/data/models/Account';
import { AccountId } from '@/src/types/domain';

/** All descendant accounts under `parentId` (direct and nested). */
export function getAccountDescendants(
  accounts: Account[],
  parentId: AccountId | string,
): Account[] {
  const directChildren = accounts.filter(a => a.parentAccountId === parentId);
  const all: Account[] = [...directChildren];
  for (const child of directChildren) {
    all.push(...getAccountDescendants(accounts, child.id));
  }
  return all;
}
