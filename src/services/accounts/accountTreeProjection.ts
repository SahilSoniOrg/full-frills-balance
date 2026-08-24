import type { AccountId } from '@/src/types/ids';
import { type AccountTreeSnapshot, type OrderedAccount } from './accountTree';

export interface FlattenedAccountTreeRow {
  accountId: AccountId;
  depth: number;
  childCount: number;
  isExpanded: boolean;
}

export interface FlattenAccountTreeOptions {
  expandedAccountIds?: ReadonlySet<AccountId | string>;
  rootAccountTypes?: readonly string[];
}

interface StackItem {
  accountId: AccountId;
  depth: number;
}

/**
 * Iteratively projects an account forest into the rows a virtualized list can render.
 * The projection never recurses, so depth is limited only by the account data.
 */
export function flattenAccountTree<T extends OrderedAccount>(
  snapshot: AccountTreeSnapshot<T>,
  options: FlattenAccountTreeOptions = {},
): FlattenedAccountTreeRow[] {
  const expandedAccountIds = options.expandedAccountIds || new Set<AccountId | string>();
  const rootTypes = options.rootAccountTypes || [...snapshot.rootsByType.keys()];
  const rows: FlattenedAccountTreeRow[] = [];
  const stack: StackItem[] = [];
  const visited = new Set<AccountId>();

  const rootIds: AccountId[] = [];
  for (const accountType of rootTypes) {
    rootIds.push(...snapshot.getChildren(null, accountType).map(account => account.id));
  }

  for (let index = rootIds.length - 1; index >= 0; index -= 1) {
    stack.push({ accountId: rootIds[index], depth: 0 });
  }

  while (stack.length > 0) {
    const item = stack.pop()!;
    if (visited.has(item.accountId)) continue;
    visited.add(item.accountId);

    const childIds = snapshot.childrenByParent.get(item.accountId) || [];
    const isExpanded = childIds.length > 0 && expandedAccountIds.has(item.accountId);
    rows.push({
      accountId: item.accountId,
      depth: item.depth,
      childCount: childIds.length,
      isExpanded,
    });

    if (!isExpanded) continue;

    for (let index = childIds.length - 1; index >= 0; index -= 1) {
      stack.push({ accountId: childIds[index], depth: item.depth + 1 });
    }
  }

  return rows;
}
