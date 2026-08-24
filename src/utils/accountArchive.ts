import { AccountFields } from '@/src/types/plainDtos';
import { AccountId } from '@/src/types/ids';

export type ArchiveAccountLike = {
  id: AccountId | string;
  parentAccountId?: AccountId | string | null;
  archivedAt?: Date | number | null;
};

export function isAccountArchived(account: { archivedAt?: Date | number | null }): boolean {
  return account.archivedAt != null;
}

export function hasArchivedAccountsInList(
  accounts: readonly { archivedAt?: Date | number | null }[],
): boolean {
  return accounts.some(isAccountArchived);
}

/** Selected archived accounts that must stay visible while show-archived is off. */
export function pinnedArchivedAccountIds<T extends ArchiveAccountLike>(
  selectedIds: Iterable<AccountId | string>,
  accounts: ReadonlyMap<string, T> | readonly T[],
): Set<AccountId> {
  const byId: Map<string, T> = Array.isArray(accounts)
    ? new Map((accounts as readonly T[]).map(account => [String(account.id), account]))
    : new Map(accounts as ReadonlyMap<string, T>);
  const pinned = new Set<AccountId>();
  for (const id of selectedIds) {
    const account = byId.get(String(id));
    if (account && isAccountArchived(account)) {
      pinned.add(id as AccountId);
    }
  }
  return pinned;
}

export function filterAccountsForDisplay<
  T extends { id: AccountId | string; archivedAt?: Date | number | null },
>(
  accounts: T[],
  showArchived: boolean,
  pinnedIds: ReadonlySet<AccountId | string> = new Set(),
): T[] {
  if (showArchived) return accounts;
  return accounts.filter(account => !isAccountArchived(account) || pinnedIds.has(account.id));
}

/**
 * Accounts that should render at hierarchy root when their parent is absent from the visible set
 * (e.g. parent archived and hidden).
 */
export function getVisibleRoots<T extends { id: string; parentAccountId?: string | null }>(
  accounts: readonly T[],
): T[] {
  const visibleIds = new Set(accounts.map(account => account.id));
  return accounts.filter(
    account => !account.parentAccountId || !visibleIds.has(account.parentAccountId),
  );
}

export interface ArchiveCascadeNode {
  account: AccountFields;
  depth: number;
}

export type AccountArchiveChanges = {
  toArchive: AccountId[];
  toUnarchive: AccountId[];
};

/** Root-first flat list of an account and all descendants, preserving hierarchy depth. */
export function buildArchiveCascadeNodes(
  rootId: AccountId,
  allAccounts: AccountFields[],
): ArchiveCascadeNode[] {
  const root = allAccounts.find(account => account.id === rootId);
  if (!root) return [];

  const byParent = new Map<string | null, AccountFields[]>();
  for (const account of allAccounts) {
    const parentId = account.parentAccountId ?? null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(account);
    byParent.set(parentId, siblings);
  }

  const nodes: ArchiveCascadeNode[] = [];
  const visited = new Set<string>();
  const walk = (account: AccountFields, depth: number) => {
    if (visited.has(account.id)) return;
    visited.add(account.id);
    nodes.push({ account, depth });
    for (const child of byParent.get(account.id) ?? []) {
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return nodes;
}

export function defaultCascadeSelection(
  nodes: ArchiveCascadeNode[],
  archiving: boolean,
): Set<AccountId> {
  const selected = new Set<AccountId>();
  for (const { account } of nodes) {
    const archived = isAccountArchived(account);
    if (archiving ? !archived : archived) {
      selected.add(account.id);
    }
  }
  return selected;
}
