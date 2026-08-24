import type { AccountId } from '@/src/types/domain';
import { createAccountTreeSnapshot, type OrderedAccount } from './accountTree';

export type AccountTreeDropKind = 'sibling-before' | 'sibling-after' | 'outside' | 'child';

export type AccountTreeDropRejectionReason =
  | 'missing-dragged-account'
  | 'missing-hovered-account'
  | 'self'
  | 'descendant'
  | 'deleted'
  | 'archived'
  | 'wrongType'
  | 'cannot-receive-children'
  | 'not-a-sibling';

export interface AccountTreeDropTarget {
  kind: AccountTreeDropKind;
  accountId: AccountId;
  parentId: AccountId | null;
  siblingIndex: number;
  anchorAccountId: AccountId;
}

export interface ResolveAccountTreeDropTargetOptions<T extends OrderedAccount> {
  canReceiveChildren: (account: T) => boolean;
}

export interface AccountTreeDropResolution {
  target: AccountTreeDropTarget | null;
  reason?: AccountTreeDropRejectionReason;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * Resolves one explicit drop slot against the current projected forest.
 * A target is always a complete placement, never a visual-only row position.
 */
export function resolveAccountTreeDropTarget<T extends OrderedAccount>(
  accounts: readonly T[],
  draggedAccountId: AccountId,
  hoveredAccountId: AccountId,
  kind: AccountTreeDropKind,
  options: ResolveAccountTreeDropTargetOptions<T>,
): AccountTreeDropResolution {
  const snapshot = createAccountTreeSnapshot(accounts);
  const dragged = snapshot.accountsById.get(draggedAccountId);
  if (!dragged) return { target: null, reason: 'missing-dragged-account' };
  const hovered = snapshot.accountsById.get(hoveredAccountId);
  if (!hovered) return { target: null, reason: 'missing-hovered-account' };
  if (dragged.id === hovered.id) return { target: null, reason: 'self' };
  if (snapshot.getDescendants(dragged.id).has(hovered.id)) {
    return { target: null, reason: 'descendant' };
  }
  if (hasValue(dragged.deletedAt)) return { target: null, reason: 'deleted' };
  if (dragged.accountType !== hovered.accountType) {
    return { target: null, reason: 'wrongType' };
  }

  if (kind === 'child') {
    if (hasValue(hovered.deletedAt)) return { target: null, reason: 'deleted' };
    if (hasValue(hovered.archivedAt)) return { target: null, reason: 'archived' };
    if (!options.canReceiveChildren(hovered)) {
      return { target: null, reason: 'cannot-receive-children' };
    }
    const children = snapshot.getChildren(hovered.id, dragged.accountType);
    return {
      target: {
        kind,
        accountId: dragged.id,
        parentId: hovered.id,
        siblingIndex: children.length,
        anchorAccountId: hovered.id,
      },
    };
  }

  const parentId = hovered.parentAccountId || null;
  const siblings = snapshot.getChildren(parentId, dragged.accountType);
  const hoveredIndex = siblings.findIndex(account => account.id === hovered.id);
  if (hoveredIndex < 0) return { target: null, reason: 'not-a-sibling' };
  const draggedIndex = siblings.findIndex(account => account.id === dragged.id);
  const indexBeforeRemoval = hoveredIndex + (kind === 'sibling-before' ? 0 : 1);
  const siblingIndex =
    draggedIndex >= 0 && draggedIndex < indexBeforeRemoval
      ? indexBeforeRemoval - 1
      : indexBeforeRemoval;
  return {
    target: {
      kind,
      accountId: dragged.id,
      parentId,
      siblingIndex,
      anchorAccountId: hovered.id,
    },
  };
}
