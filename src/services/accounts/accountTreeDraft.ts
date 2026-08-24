import type { AccountId } from '@/src/types/ids';
import {
  createAccountTreeSnapshot,
  planAccountTreeMove,
  type AccountTreePlacement,
  type OrderedAccount,
} from './accountTree';
import type { AccountTreeDropTarget } from './accountTreeTargets';

export interface AccountTreeDraftOperation {
  accountId: AccountId;
  affectedDescendantCount: number;
}

export interface AccountTreeDraft<T extends OrderedAccount> {
  baselineAccounts: readonly T[];
  accounts: readonly T[];
  operations: readonly AccountTreeDraftOperation[];
  placementChanges: ReadonlyMap<AccountId, AccountTreePlacement>;
}

export function createAccountTreeDraft<T extends OrderedAccount>(
  accounts: readonly T[],
): AccountTreeDraft<T> {
  return {
    baselineAccounts: accounts,
    accounts,
    operations: [],
    placementChanges: new Map(),
  };
}

function getPlacement(account: OrderedAccount): AccountTreePlacement {
  return {
    parentAccountId: account.parentAccountId || undefined,
    orderNum: account.orderNum ?? 0,
  };
}

function samePlacement(a: OrderedAccount, b: OrderedAccount): boolean {
  return (
    (a.parentAccountId || undefined) === (b.parentAccountId || undefined) &&
    (a.orderNum ?? 0) === (b.orderNum ?? 0)
  );
}

function applyPlacementPatch<T extends OrderedAccount>(
  accounts: readonly T[],
  patch: ReadonlyMap<AccountId, AccountTreePlacement>,
): T[] {
  return accounts.map(account => {
    const update = patch.get(account.id);
    return update ? { ...account, ...update } : account;
  });
}

function buildPlacementChanges<T extends OrderedAccount>(
  baselineAccounts: readonly T[],
  accounts: readonly T[],
): Map<AccountId, AccountTreePlacement> {
  const baselineById = new Map(baselineAccounts.map(account => [account.id, account] as const));
  const changes = new Map<AccountId, AccountTreePlacement>();
  for (const account of accounts) {
    const baseline = baselineById.get(account.id);
    if (baseline && !samePlacement(baseline, account)) {
      changes.set(account.id, getPlacement(account));
    }
  }
  return changes;
}

export function stageAccountTreeDraftDrop<T extends OrderedAccount>(
  draft: AccountTreeDraft<T>,
  target: AccountTreeDropTarget,
): AccountTreeDraft<T> {
  const patch = planAccountTreeMove(draft.accounts, {
    accountId: target.accountId,
    parentId: target.parentId,
    siblingIndex: target.siblingIndex,
  });
  if (patch.size === 0) return draft;
  const nextAccounts = applyPlacementPatch(draft.accounts, patch);
  const placementChanges = buildPlacementChanges(draft.baselineAccounts, nextAccounts);

  const snapshot = createAccountTreeSnapshot(draft.accounts);
  const affectedDescendantCount = snapshot.getDescendants(target.accountId).size;
  const operation: AccountTreeDraftOperation = {
    accountId: target.accountId,
    affectedDescendantCount,
  };
  const operations = draft.operations.filter(
    previous => previous.accountId !== target.accountId && placementChanges.has(previous.accountId),
  );
  if (placementChanges.has(target.accountId)) operations.push(operation);
  return {
    ...draft,
    accounts: nextAccounts,
    operations,
    placementChanges,
  };
}

export function discardAccountTreeDraft<T extends OrderedAccount>(
  draft: AccountTreeDraft<T>,
): AccountTreeDraft<T> {
  return createAccountTreeDraft(draft.baselineAccounts);
}

export function isAccountTreeDraftDirty<T extends OrderedAccount>(
  draft: AccountTreeDraft<T>,
): boolean {
  return draft.placementChanges.size > 0;
}

export function getAccountTreeDraftPlacementChanges<T extends OrderedAccount>(
  draft: AccountTreeDraft<T>,
): ReadonlyMap<AccountId, AccountTreePlacement> {
  return draft.placementChanges;
}

export function getAccountTreeSubtreeMovePreview(
  accountName: string,
  operation: Pick<AccountTreeDraftOperation, 'affectedDescendantCount'>,
): string {
  if (operation.affectedDescendantCount === 0) return `Moves ${accountName}`;
  const noun = operation.affectedDescendantCount === 1 ? 'child account' : 'child accounts';
  return `Moves ${accountName} and ${operation.affectedDescendantCount} ${noun}`;
}
