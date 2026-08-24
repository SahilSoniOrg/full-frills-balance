import type { AccountId, WorkplaceId } from '@/src/types/ids';

/**
 * Storage shape owned by the Account Tree module. Callers should consume the
 * snapshot/commands below instead of rebuilding parent and sibling indexes.
 */
export interface OrderedAccount {
  id: AccountId;
  accountType?: string;
  parentAccountId?: AccountId | null;
  orderNum?: number;
  deletedAt?: unknown;
  archivedAt?: unknown;
  name?: string;
}

export interface AccountTreeMove {
  accountId: AccountId;
  parentId: AccountId | null;
  siblingIndex: number;
}

export interface AccountTreePlacementChange {
  accountId: AccountId;
  parentId: AccountId | null;
  siblingIndex: number;
  nextAccountType?: string;
}

export interface AccountTreeRowState {
  accountId: AccountId;
  accountType?: string;
  parentAccountId?: AccountId;
  orderNum: number;
}

export interface AccountTreePlacement {
  parentAccountId?: AccountId;
  orderNum: number;
}

export interface AccountTreeSiblingListState {
  parentAccountId?: AccountId;
  accountType?: string;
  accountIds: readonly AccountId[];
}

export interface AccountTreeMoveReceipt {
  workplaceId: WorkplaceId;
  movedAccountIds: readonly AccountId[];
  destination: { parentId: AccountId | null; siblingIndex: number };
  before: readonly AccountTreeRowState[];
  after: readonly AccountTreeRowState[];
  beforeLists: readonly AccountTreeSiblingListState[];
  afterLists: readonly AccountTreeSiblingListState[];
}

export interface AccountTreeSnapshot<T extends OrderedAccount = OrderedAccount> {
  readonly accountsById: ReadonlyMap<AccountId, T>;
  readonly rootsByType: ReadonlyMap<string, readonly AccountId[]>;
  readonly childrenByParent: ReadonlyMap<AccountId, readonly AccountId[]>;
  readonly parentByAccount: ReadonlyMap<AccountId, AccountId | null>;
  readonly leafAccountIds: ReadonlySet<AccountId>;
  readonly getChildren: (parentId: AccountId | null, accountType?: string) => readonly T[];
  readonly getDescendants: (accountId: AccountId) => ReadonlySet<AccountId>;
  readonly getParentCandidates: (
    accountId: AccountId,
    options?: { hasDirectTransactions?: (account: T) => boolean },
  ) => readonly T[];
}

const rootKey = (accountType?: string) => accountType || '';
export const getAccountTreeSiblingListKey = (
  parentId: AccountId | null | undefined,
  accountType?: string,
) => (parentId ? `parent:${parentId}` : `root:${rootKey(accountType)}`);
const isPresent = (value: unknown): boolean => value !== undefined && value !== null;

function ordered<T extends OrderedAccount>(accounts: readonly T[]): T[] {
  return [...accounts].sort(
    (a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0) || a.id.localeCompare(b.id),
  );
}

/** Build one immutable-in-use view of an account hierarchy. */
export function createAccountTreeSnapshot<T extends OrderedAccount>(
  accounts: readonly T[],
): AccountTreeSnapshot<T> {
  const accountsById = new Map(accounts.map(account => [account.id, account] as const));
  const siblingLists = new Map<string, T[]>();
  const childrenMutable = new Map<AccountId, AccountId[]>();
  const parentByAccount = new Map<AccountId, AccountId | null>();

  for (const account of accounts) {
    const parentId = account.parentAccountId || null;
    parentByAccount.set(account.id, parentId);
    const key = getAccountTreeSiblingListKey(parentId, account.accountType);
    const siblings = siblingLists.get(key) || [];
    siblings.push(account);
    siblingLists.set(key, siblings);
    if (parentId) {
      const children = childrenMutable.get(parentId) || [];
      children.push(account.id);
      childrenMutable.set(parentId, children);
    }
  }

  const rootsByType = new Map<string, readonly AccountId[]>();
  for (const [key, siblings] of siblingLists) {
    if (key.startsWith('root:')) {
      rootsByType.set(key.slice(5), Object.freeze(ordered(siblings).map(account => account.id)));
    }
  }

  const childrenByParent = new Map<AccountId, readonly AccountId[]>();
  for (const [parentId, children] of childrenMutable) {
    const sorted = ordered(children.map(id => accountsById.get(id)!)).map(account => account.id);
    childrenByParent.set(parentId, Object.freeze(sorted));
  }

  const descendantsByAccount = new Map<AccountId, ReadonlySet<AccountId>>();
  const getDescendants = (accountId: AccountId): ReadonlySet<AccountId> => {
    const existing = descendantsByAccount.get(accountId);
    if (existing) return existing;
    const descendants = new Set<AccountId>();
    const stack = [...(childrenByParent.get(accountId) || [])];
    while (stack.length) {
      const childId = stack.pop()!;
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      stack.push(...(childrenByParent.get(childId) || []));
    }
    descendantsByAccount.set(accountId, descendants);
    return descendants;
  };

  const leafAccountIds = new Set<AccountId>();
  for (const account of accounts) {
    if (!childrenByParent.get(account.id)?.length) leafAccountIds.add(account.id);
  }

  const getChildren = (parentId: AccountId | null, accountType?: string): readonly T[] => {
    const ids = parentId
      ? childrenByParent.get(parentId) || []
      : rootsByType.get(rootKey(accountType)) || [];
    return Object.freeze(ids.map(id => accountsById.get(id)!).filter(Boolean));
  };

  const getParentCandidates = (
    accountId: AccountId,
    options?: { hasDirectTransactions?: (account: T) => boolean },
  ): readonly T[] => {
    const account = accountsById.get(accountId);
    if (!account) return Object.freeze([]);
    const blocked = new Set([accountId, ...getDescendants(accountId)]);
    return Object.freeze(
      accounts
        .filter(
          candidate =>
            candidate.id !== accountId &&
            candidate.accountType === account.accountType &&
            !blocked.has(candidate.id) &&
            !isPresent(candidate.deletedAt) &&
            !isPresent(candidate.archivedAt) &&
            !options?.hasDirectTransactions?.(candidate),
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id)),
    );
  };

  return {
    accountsById,
    rootsByType,
    childrenByParent,
    parentByAccount,
    leafAccountIds,
    getChildren,
    getDescendants,
    getParentCandidates,
  };
}

/** Validate structural invariants that do not require a database query. */
export function validateAccountTreeMove<T extends OrderedAccount>(
  accounts: readonly T[],
  move: AccountTreeMove,
  existingSnapshot?: AccountTreeSnapshot<T>,
): void {
  if (!Number.isInteger(move.siblingIndex) || move.siblingIndex < 0) {
    throw new Error('Invalid sibling position');
  }
  const snapshot = existingSnapshot || createAccountTreeSnapshot(accounts);
  const account = snapshot.accountsById.get(move.accountId);
  if (!account) throw new Error('Account not found');
  if (isPresent(account.deletedAt)) throw new Error('Deleted accounts cannot be moved');
  if (!move.parentId) return;
  const parent = snapshot.accountsById.get(move.parentId);
  if (!parent) throw new Error('Parent account not found');
  if (isPresent(parent.deletedAt)) throw new Error('Deleted accounts cannot have new children');
  if (isPresent(parent.archivedAt)) throw new Error('Archived accounts cannot have new children');
  if (parent.accountType !== account.accountType) {
    throw new Error('Parent and child accounts must have the same account type');
  }
  if (snapshot.getDescendants(move.accountId).has(move.parentId)) {
    throw new Error('Circular parent relationship detected');
  }
}

function planFromSiblingLists<T extends OrderedAccount>(
  accounts: readonly T[],
  finalLists: ReadonlyMap<string, readonly T[]>,
  touchedKeys?: ReadonlySet<string>,
): Map<AccountId, { parentAccountId?: AccountId; orderNum: number }> {
  const byId = new Map(accounts.map(account => [account.id, account] as const));
  const changed = new Map<AccountId, { parentAccountId?: AccountId; orderNum: number }>();
  for (const [key, siblings] of finalLists) {
    if (touchedKeys && !touchedKeys.has(key)) continue;
    const parentId = key.startsWith('parent:') ? (key.slice(7) as AccountId) : undefined;
    siblings.forEach((sibling, orderNum) => {
      const current = byId.get(sibling.id)!;
      if ((current.parentAccountId || undefined) !== parentId || current.orderNum !== orderNum) {
        changed.set(sibling.id, { parentAccountId: parentId, orderNum });
      }
    });
  }
  return changed;
}

/** Plan several moves while preserving selected nodes' current sibling order. */
export function planAccountTreeBulkMove<T extends OrderedAccount>(
  accounts: readonly T[],
  accountIds: readonly AccountId[],
  destination: Omit<AccountTreeMove, 'accountId'>,
  existingSnapshot?: AccountTreeSnapshot<T>,
): Map<AccountId, { parentAccountId?: AccountId; orderNum: number }> {
  if (accountIds.length === 0) return new Map();
  const snapshot = existingSnapshot || createAccountTreeSnapshot(accounts);
  const selected = new Set(accountIds);
  if (selected.size !== accountIds.length) throw new Error('Duplicate account in tree move');
  for (const accountId of accountIds) {
    validateAccountTreeMove(accounts, { accountId, ...destination }, snapshot);
    if (destination.parentId && selected.has(destination.parentId)) {
      throw new Error('Cannot move accounts into the selected hierarchy');
    }
  }
  for (const accountId of accountIds) {
    if ([...snapshot.getDescendants(accountId)].some(id => selected.has(id))) {
      throw new Error('Cannot move an account and one of its descendants together');
    }
  }

  const lists = new Map<string, T[]>();
  const touchedKeys = new Set<string>();
  for (const account of accounts) {
    const key = getAccountTreeSiblingListKey(account.parentAccountId, account.accountType);
    const list = lists.get(key) || [];
    list.push(account);
    lists.set(key, list);
  }
  for (const accountId of accountIds) {
    const account = snapshot.accountsById.get(accountId)!;
    touchedKeys.add(getAccountTreeSiblingListKey(account.parentAccountId, account.accountType));
    touchedKeys.add(getAccountTreeSiblingListKey(destination.parentId, account.accountType));
  }
  for (const [key, list] of lists)
    lists.set(
      key,
      ordered(list).filter(a => !selected.has(a.id)),
    );

  const selectedAccounts = ordered(
    accountIds.map(id => snapshot.accountsById.get(id)!).filter(Boolean),
  );
  const grouped = new Map<string, T[]>();
  for (const account of selectedAccounts) {
    const key = getAccountTreeSiblingListKey(destination.parentId, account.accountType);
    const group = grouped.get(key) || [];
    group.push(account);
    grouped.set(key, group);
  }
  for (const [key, group] of grouped) {
    const list = lists.get(key) || [];
    list.splice(Math.min(destination.siblingIndex, list.length), 0, ...group);
    lists.set(key, list);
  }
  return planFromSiblingLists(accounts, lists, touchedKeys);
}

/**
 * Plan a single placement while allowing its account type to change in the
 * same transaction. Both the old and new sibling lists are normalized.
 */
export function planAccountTreePlacementChange<T extends OrderedAccount>(
  accounts: readonly T[],
  change: AccountTreePlacementChange,
  existingSnapshot?: AccountTreeSnapshot<T>,
): Map<AccountId, { parentAccountId?: AccountId; orderNum: number }> {
  if (!Number.isInteger(change.siblingIndex) || change.siblingIndex < 0) {
    throw new Error('Invalid sibling position');
  }
  const snapshot = existingSnapshot || createAccountTreeSnapshot(accounts);
  const account = snapshot.accountsById.get(change.accountId);
  if (!account) throw new Error('Account not found');

  const nextType = change.nextAccountType ?? account.accountType;
  const oldKey = getAccountTreeSiblingListKey(account.parentAccountId, account.accountType);
  const newKey = getAccountTreeSiblingListKey(change.parentId, nextType);
  const lists = new Map<string, T[]>();
  for (const candidate of accounts) {
    const key = getAccountTreeSiblingListKey(candidate.parentAccountId, candidate.accountType);
    const list = lists.get(key) || [];
    list.push(candidate);
    lists.set(key, list);
  }
  for (const [key, list] of lists) {
    lists.set(
      key,
      ordered(list).filter(candidate => candidate.id !== account.id),
    );
  }

  const destination = lists.get(newKey) || [];
  const projected = {
    id: account.id,
    accountType: nextType,
    parentAccountId: change.parentId || undefined,
    orderNum: account.orderNum,
  } as T;
  destination.splice(Math.min(change.siblingIndex, destination.length), 0, projected);
  lists.set(newKey, destination);

  return planFromSiblingLists(accounts, lists, new Set([oldKey, newKey]));
}

/** Moves one node (and therefore its untouched subtree) between sibling lists. */
export function planAccountTreeMove<T extends OrderedAccount>(
  accounts: readonly T[],
  move: AccountTreeMove,
): Map<AccountId, { parentAccountId?: AccountId; orderNum: number }> {
  return planAccountTreeBulkMove(accounts, [move.accountId], move);
}

export function collectAccountDescendantIds<T extends OrderedAccount>(
  accounts: readonly T[],
  accountId: AccountId,
): Set<AccountId> {
  return new Set(createAccountTreeSnapshot(accounts).getDescendants(accountId));
}

/** Validate the complete parent forest after composing multiple draft operations. */
export function validateAccountTreeStructure<T extends OrderedAccount>(
  accounts: readonly T[],
  options?: { siblingListKeys?: ReadonlySet<string> },
): void {
  const accountsById = new Map(accounts.map(account => [account.id, account] as const));
  for (const account of accounts) {
    const parentId = account.parentAccountId || null;
    if (!parentId) continue;
    const parent = accountsById.get(parentId);
    if (!parent) throw new Error('Parent account references missing or deleted account(s)');
    if (parent.accountType !== account.accountType) {
      throw new Error('Parent and child accounts must have the same account type');
    }
  }

  const visited = new Set<AccountId>();
  for (const account of accounts) {
    if (visited.has(account.id)) continue;
    const path = new Set<AccountId>();
    let current: T | undefined = account;
    while (current) {
      if (path.has(current.id)) throw new Error('Circular parent relationship detected');
      if (visited.has(current.id)) break;
      path.add(current.id);
      visited.add(current.id);
      const parentId: AccountId | null = current.parentAccountId || null;
      current = parentId ? accountsById.get(parentId) : undefined;
    }
  }

  const siblingLists = new Map<string, T[]>();
  for (const account of accounts) {
    const key = getAccountTreeSiblingListKey(account.parentAccountId, account.accountType);
    const siblings = siblingLists.get(key) || [];
    siblings.push(account);
    siblingLists.set(key, siblings);
  }
  for (const [key, siblings] of siblingLists) {
    if (options?.siblingListKeys && !options.siblingListKeys.has(key)) continue;
    const positions = siblings.map(account => account.orderNum ?? 0).sort((a, b) => a - b);
    if (positions.some((position, index) => !Number.isInteger(position) || position !== index)) {
      throw new Error('Sibling order must be contiguous and start at zero');
    }
  }
}
