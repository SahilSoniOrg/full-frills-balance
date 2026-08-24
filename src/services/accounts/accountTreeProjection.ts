import type { AccountId } from '@/src/types/ids';
import { type AccountTreeSnapshot, type OrderedAccount } from './accountTree';

export interface FlattenedAccountTreeRow {
  accountId: AccountId;
  accountType?: string;
  depth: number;
  childCount: number;
  isExpanded: boolean;
  /** Set on the first visible root in each account-type section. */
  sectionLabel?: string;
  isSectionCollapsed?: boolean;
}

export interface FlattenAccountTreeOptions {
  expandedAccountIds?: ReadonlySet<AccountId | string>;
  rootAccountTypes?: readonly string[];
  collapsedAccountTypes?: ReadonlySet<string>;
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
  const collapsedAccountTypes = options.collapsedAccountTypes || new Set<string>();
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

  const firstRootByType = new Set<string>();

  while (stack.length > 0) {
    const item = stack.pop()!;
    if (visited.has(item.accountId)) continue;
    visited.add(item.accountId);

    const childIds = snapshot.childrenByParent.get(item.accountId) || [];
    const account = snapshot.accountsById.get(item.accountId);
    const accountType = account?.accountType;
    const isSectionCollapsed =
      item.depth === 0 && !!accountType && collapsedAccountTypes.has(accountType);
    const isExpanded =
      !isSectionCollapsed && childIds.length > 0 && expandedAccountIds.has(item.accountId);
    const sectionLabel =
      item.depth === 0 && accountType && !firstRootByType.has(accountType)
        ? formatAccountTypeLabel(accountType)
        : undefined;
    if (item.depth === 0 && accountType) firstRootByType.add(accountType);
    rows.push({
      accountId: item.accountId,
      accountType,
      depth: item.depth,
      childCount: childIds.length,
      isExpanded,
      sectionLabel,
      isSectionCollapsed: isSectionCollapsed || undefined,
    });

    if (!isExpanded) continue;

    for (let index = childIds.length - 1; index >= 0; index -= 1) {
      stack.push({ accountId: childIds[index], depth: item.depth + 1 });
    }
  }

  return rows;
}

function formatAccountTypeLabel(accountType: string): string {
  const pluralLabels: Record<string, string> = {
    ASSET: 'Assets',
    LIABILITY: 'Liabilities',
    EQUITY: 'Equity',
    INCOME: 'Income',
    EXPENSE: 'Expenses',
  };
  const knownLabel = pluralLabels[accountType];
  if (knownLabel) return knownLabel;
  return accountType
    .toLowerCase()
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
