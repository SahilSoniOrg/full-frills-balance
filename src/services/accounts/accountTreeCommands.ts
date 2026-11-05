import { matcherEligibilityChanged } from '@/src/services/accounts/accountMatcherEligibility';
import { withAccountRecognitionRefreshWhen } from '@/src/services/accounts/accountRecognitionRefresh';
import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/types/enums';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import {
  accountTreeTransactionCoordinator,
  accountWriteRepository,
} from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { assertParentHasNoTransactions } from '@/src/services/accounts/accountRules';
import {
  createAccountTreeSnapshot,
  getAccountTreeSiblingListKey,
  planAccountTreeBulkMove,
  validateAccountTreeStructure,
  type AccountTreePlacement,
  type AccountTreeSiblingListState,
  type AccountTreeRowState,
  type AccountTreeMoveReceipt,
} from '@/src/services/accounts/accountTree';

const STALE_TREE_ERROR = 'Account tree changed; staged changes are no longer current';

function siblingListState(
  accounts: readonly Pick<Account, 'id' | 'accountType' | 'parentAccountId' | 'orderNum'>[],
  parentAccountId: AccountId | undefined,
  accountType: Account['accountType'],
): AccountTreeSiblingListState {
  return {
    parentAccountId,
    accountType,
    accountIds: accounts
      .filter(
        account =>
          account.accountType === accountType &&
          (account.parentAccountId || undefined) === parentAccountId,
      )
      .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0) || a.id.localeCompare(b.id))
      .map(account => account.id),
  };
}

function prepareAccountTreePlacementMutation(
  account: Account,
  placement: AccountTreePlacement,
  workplaceId: WorkplaceId,
  reason?: string,
) {
  const before: AccountTreeRowState = {
    accountId: account.id,
    accountType: account.accountType,
    parentAccountId: account.parentAccountId || undefined,
    orderNum: account.orderNum ?? 0,
  };
  const after: AccountTreeRowState = {
    accountId: account.id,
    accountType: account.accountType,
    parentAccountId: placement.parentAccountId,
    orderNum: placement.orderNum,
  };
  return {
    before,
    after,
    ops: [
      ...accountWriteRepository.prepareUpdateBatchOps(account, placement, null),
      auditRepository.prepareLog(
        {
          entityType: 'account',
          entityId: account.id,
          action: AuditAction.UPDATE,
          changes: reason ? { before, after, reason } : { before, after },
        },
        workplaceId,
      ),
    ],
  };
}

function assertAccountTreeDraftBaseline(
  accounts: readonly Account[],
  baseline: readonly AccountTreeRowState[],
  placements: ReadonlyMap<AccountId, AccountTreePlacement>,
): void {
  const accountsById = new Map(accounts.map(account => [account.id, account] as const));
  const baselineById = new Map(baseline.map(row => [row.accountId, row] as const));

  for (const expected of baseline) {
    const account = accountsById.get(expected.accountId);
    if (
      !account ||
      (expected.accountType !== undefined && account.accountType !== expected.accountType) ||
      (account.parentAccountId || undefined) !== expected.parentAccountId ||
      (account.orderNum ?? 0) !== expected.orderNum
    ) {
      throw new Error(STALE_TREE_ERROR);
    }
  }

  const touchedListKeys = new Set<string>();
  for (const [accountId, placement] of placements) {
    const account = accountsById.get(accountId);
    const expected = baselineById.get(accountId);
    if (!account || !expected) throw new Error(STALE_TREE_ERROR);
    const accountType = expected.accountType ?? account.accountType;
    touchedListKeys.add(getAccountTreeSiblingListKey(expected.parentAccountId, accountType));
    touchedListKeys.add(getAccountTreeSiblingListKey(placement.parentAccountId, accountType));
  }

  for (const key of touchedListKeys) {
    const expectedIds = baseline
      .filter(row => {
        const account = accountsById.get(row.accountId);
        const accountType = row.accountType ?? account?.accountType;
        return getAccountTreeSiblingListKey(row.parentAccountId, accountType) === key;
      })
      .sort((a, b) => a.orderNum - b.orderNum || a.accountId.localeCompare(b.accountId))
      .map(row => row.accountId);
    const currentIds = accounts
      .filter(
        account =>
          getAccountTreeSiblingListKey(account.parentAccountId, account.accountType) === key,
      )
      .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0) || a.id.localeCompare(b.id))
      .map(account => account.id);
    if (
      currentIds.length !== expectedIds.length ||
      currentIds.some((id, index) => id !== expectedIds[index])
    ) {
      throw new Error(STALE_TREE_ERROR);
    }
  }
}

/** Persist one or more structural moves as one atomic tree mutation. */
async function moveAccountsCore(
  workplaceId: WorkplaceId,
  accountIds: readonly AccountId[],
  destination: { parentId: AccountId | null; siblingIndex: number },
  invalidate: () => void,
): Promise<AccountTreeMoveReceipt> {
  if (!Number.isInteger(destination.siblingIndex) || destination.siblingIndex < 0) {
    throw new Error('Invalid sibling position');
  }
  if (accountIds.length === 0) {
    return {
      workplaceId,
      movedAccountIds: [],
      destination,
      before: [],
      after: [],
      beforeLists: [],
      afterLists: [],
    };
  }

  const receipt = await accountTreeTransactionCoordinator.run(workplaceId, async accounts => {
    const snapshot = createAccountTreeSnapshot(accounts);
    if (destination.parentId) {
      const hasTransactions = await transactionQueryRepository.hasTransactions(
        workplaceId,
        destination.parentId,
      );
      if (hasTransactions) {
        const parent = accounts.find(account => account.id === destination.parentId);
        if (parent) assertParentHasNoTransactions(parent.name);
      }
    }

    const changes = planAccountTreeBulkMove(accounts, accountIds, destination, snapshot);
    if (changes.size === 0) {
      return {
        prepareOps: () => [],
        result: {
          workplaceId,
          movedAccountIds: [...accountIds],
          destination,
          before: [],
          after: [],
          beforeLists: [],
          afterLists: [],
        },
      };
    }
    const accountsById = new Map(accounts.map(candidate => [candidate.id, candidate]));
    const touchedLists = new Map<
      string,
      { parentAccountId: AccountId | undefined; accountType: Account['accountType'] }
    >();
    for (const [changedAccountId, updates] of changes) {
      const changedAccount = accountsById.get(changedAccountId);
      if (!changedAccount) throw new Error('Account not found');
      if (
        matcherEligibilityChanged(
          (changedAccount.parentAccountId || undefined) !== updates.parentAccountId
            ? { parentAccountId: updates.parentAccountId ?? null }
            : {},
        )
      ) {
        invalidate();
      }
      for (const parentAccountId of [
        changedAccount.parentAccountId || undefined,
        updates.parentAccountId,
      ]) {
        const key = `${parentAccountId || ''}:${changedAccount.accountType}`;
        touchedLists.set(key, { parentAccountId, accountType: changedAccount.accountType });
      }
    }
    const projectedAccounts = accounts.map(account => {
      const updates = changes.get(account.id);
      return updates
        ? {
            id: account.id,
            accountType: account.accountType,
            parentAccountId: updates.parentAccountId,
            orderNum: updates.orderNum,
          }
        : account;
    });
    const beforeLists = [...touchedLists.values()].map(({ parentAccountId, accountType }) =>
      siblingListState(accounts, parentAccountId, accountType),
    );
    const afterLists = [...touchedLists.values()].map(({ parentAccountId, accountType }) =>
      siblingListState(projectedAccounts, parentAccountId, accountType),
    );
    const before: AccountTreeRowState[] = [];
    const after: AccountTreeRowState[] = [];
    const changedAccountPlacements = [...changes].map(([changedAccountId, updates]) => {
      const changedAccount = accountsById.get(changedAccountId);
      if (!changedAccount) throw new Error('Account not found');
      before.push({
        accountId: changedAccount.id,
        accountType: changedAccount.accountType,
        parentAccountId: changedAccount.parentAccountId || undefined,
        orderNum: changedAccount.orderNum ?? 0,
      });
      after.push({
        accountId: changedAccount.id,
        accountType: changedAccount.accountType,
        parentAccountId: updates.parentAccountId,
        orderNum: updates.orderNum,
      });
      return { changedAccount, updates };
    });
    const prepareOps = () => {
      const ops = [];
      for (const { changedAccount, updates } of changedAccountPlacements) {
        ops.push(...prepareAccountTreePlacementMutation(changedAccount, updates, workplaceId).ops);
      }
      return ops;
    };
    return {
      prepareOps,
      result: {
        workplaceId,
        movedAccountIds: [...accountIds],
        destination,
        before,
        after,
        beforeLists,
        afterLists,
      },
    };
  });
  return receipt;
}

/** A single named tree move. */
export async function moveAccount(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  destination: { parentId: AccountId | null; siblingIndex: number },
): Promise<AccountTreeMoveReceipt> {
  return moveAccounts(workplaceId, [accountId], destination);
}

/**
 * Atomically persist a complete staged tree projection. The baseline is checked
 * inside the transaction so an edit made on stale hierarchy data cannot partially
 * overwrite a newer tree.
 */
async function saveAccountTreeDraftCore(
  workplaceId: WorkplaceId,
  baseline: readonly AccountTreeRowState[],
  placements: ReadonlyMap<AccountId, AccountTreePlacement>,
  invalidate: () => void,
): Promise<void> {
  if (placements.size === 0) return;

  await accountTreeTransactionCoordinator.run(workplaceId, async accounts => {
    const accountsById = new Map(accounts.map(account => [account.id, account] as const));
    assertAccountTreeDraftBaseline(accounts, baseline, placements);

    const projectedAccounts = accounts.map(account => {
      const placement = placements.get(account.id);
      return {
        id: account.id,
        accountType: account.accountType,
        parentAccountId: placement
          ? placement.parentAccountId
          : (account.parentAccountId ?? undefined),
        orderNum: placement?.orderNum ?? account.orderNum ?? 0,
        archivedAt: account.archivedAt,
        deletedAt: account.deletedAt,
      };
    });
    const touchedSiblingListKeys = new Set<string>();
    for (const [accountId, placement] of placements) {
      const account = accountsById.get(accountId);
      if (!account) throw new Error('Account not found');
      touchedSiblingListKeys.add(
        getAccountTreeSiblingListKey(account.parentAccountId, account.accountType),
      );
      touchedSiblingListKeys.add(
        getAccountTreeSiblingListKey(placement.parentAccountId, account.accountType),
      );
    }
    validateAccountTreeStructure(projectedAccounts, {
      siblingListKeys: touchedSiblingListKeys,
    });

    const changedAccounts: Account[] = [];
    for (const [accountId, placement] of placements) {
      const account = accountsById.get(accountId);
      if (!account) throw new Error('Account not found');
      if (account.deletedAt) throw new Error('Deleted accounts cannot be moved');
      const parentId = placement.parentAccountId;
      if (!parentId) continue;
      const parent = accountsById.get(parentId);
      if (!parent) throw new Error('Parent account references missing or deleted account(s)');
      if (parent.deletedAt) {
        throw new Error('Parent account references missing or deleted account(s)');
      }
      if (parent.archivedAt) throw new Error('Archived accounts cannot have new children');
      if ((account.parentAccountId || undefined) === parentId) continue;
      const hasTransactions = await transactionQueryRepository.hasTransactions(
        workplaceId,
        parentId,
      );
      if (hasTransactions) assertParentHasNoTransactions(parent.name);
    }

    for (const [accountId, placement] of placements) {
      const account = accountsById.get(accountId);
      if (!account) throw new Error('Account not found');
      const current = {
        accountId,
        parentAccountId: account.parentAccountId || undefined,
        orderNum: account.orderNum ?? 0,
      };
      if (
        current.parentAccountId === placement.parentAccountId &&
        current.orderNum === placement.orderNum
      ) {
        continue;
      }
      if (
        matcherEligibilityChanged(
          current.parentAccountId !== placement.parentAccountId
            ? { parentAccountId: placement.parentAccountId ?? null }
            : {},
        )
      ) {
        invalidate();
      }
      changedAccounts.push(account);
    }

    const prepareOps = () =>
      changedAccounts.flatMap(account => {
        const placement = placements.get(account.id)!;
        return prepareAccountTreePlacementMutation(
          account,
          placement,
          workplaceId,
          'account_tree_draft_save',
        ).ops;
      });

    return { prepareOps, result: undefined };
  });
}

/** Restore a move only when the affected rows still match its receipt. */
async function restoreAccountTreeMoveCore(
  workplaceId: WorkplaceId,
  receipt: AccountTreeMoveReceipt,
  invalidate: () => void,
): Promise<void> {
  if (receipt.workplaceId !== workplaceId) {
    throw new Error('Account tree receipt belongs to a different workplace');
  }

  await accountTreeTransactionCoordinator.run(workplaceId, async accounts => {
    const accountsById = new Map(accounts.map(account => [account.id, account]));
    for (const expected of receipt.after) {
      const account = accountsById.get(expected.accountId);
      if (!account) throw new Error('Account tree changed; undo is no longer available');
      const currentParent = account.parentAccountId || undefined;
      if (
        currentParent !== expected.parentAccountId ||
        (account.orderNum ?? 0) !== expected.orderNum
      ) {
        throw new Error('Account tree changed; undo is no longer available');
      }
    }
    for (const expectedList of receipt.afterLists) {
      const currentList = siblingListState(
        accounts,
        expectedList.parentAccountId,
        expectedList.accountType as Account['accountType'],
      );
      if (
        currentList.accountIds.length !== expectedList.accountIds.length ||
        currentList.accountIds.some((id, index) => id !== expectedList.accountIds[index])
      ) {
        throw new Error('Account tree changed; undo is no longer available');
      }
    }

    const beforeTargets = receipt.before.map(target => {
      const account = accountsById.get(target.accountId);
      if (!account) throw new Error('Account tree changed; undo is no longer available');
      if (
        matcherEligibilityChanged(
          (account.parentAccountId || undefined) !== target.parentAccountId
            ? { parentAccountId: target.parentAccountId ?? null }
            : {},
        )
      ) {
        invalidate();
      }
      return { account, target };
    });

    const prepareOps = () => {
      const ops = [];
      for (const { account, target } of beforeTargets) {
        ops.push(
          ...prepareAccountTreePlacementMutation(
            account,
            target,
            workplaceId,
            'account_tree_restore',
          ).ops,
        );
      }
      return ops;
    };
    return { prepareOps, result: undefined };
  });
}

export function moveAccounts(
  workplaceId: WorkplaceId,
  accountIds: readonly AccountId[],
  destination: { parentId: AccountId | null; siblingIndex: number },
): Promise<AccountTreeMoveReceipt> {
  return withAccountRecognitionRefreshWhen(workplaceId, invalidate =>
    moveAccountsCore(workplaceId, accountIds, destination, invalidate),
  );
}

export function saveAccountTreeDraft(
  workplaceId: WorkplaceId,
  baseline: readonly AccountTreeRowState[],
  placements: ReadonlyMap<AccountId, AccountTreePlacement>,
): Promise<void> {
  return withAccountRecognitionRefreshWhen(workplaceId, invalidate =>
    saveAccountTreeDraftCore(workplaceId, baseline, placements, invalidate),
  );
}

export function restoreAccountTreeMove(
  workplaceId: WorkplaceId,
  receipt: AccountTreeMoveReceipt,
): Promise<void> {
  return withAccountRecognitionRefreshWhen(workplaceId, invalidate =>
    restoreAccountTreeMoveCore(workplaceId, receipt, invalidate),
  );
}
