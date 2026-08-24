import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import {
  accountQueryRepository,
  accountTreeTransactionCoordinator,
  accountWriteRepository,
} from '@/src/data/repositories/account';
import type { AccountPersistenceInput } from '@/src/data/repositories/account/types';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { analytics } from '@/src/services/analytics';
import { CreateAccountData } from '@/src/services/accounts/accountCommands';
import {
  assertNotSelfParent,
  assertParentHasNoTransactions,
  assertParentMatchesChildType,
} from '@/src/services/accounts/accountRules';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/utils/logger';
import { isValidHexColor } from '@/src/utils/accountCategory';
import {
  createAccountTreeSnapshot,
  getAccountTreeSiblingListKey,
  planAccountTreeBulkMove,
  planAccountTreePlacementChange,
  validateAccountTreeStructure,
  type AccountTreePlacement,
  type AccountTreeSiblingListState,
  type AccountTreeRowState,
  type AccountTreeMoveReceipt,
} from '@/src/services/accounts/accountTree';

const STALE_TREE_ERROR = 'Account tree changed; staged changes are no longer current';

export type AccountDetailsUpdate = Partial<
  Pick<
    CreateAccountData,
    | 'name'
    | 'accountType'
    | 'accountSubtype'
    | 'currencyCode'
    | 'description'
    | 'icon'
    | 'color'
    | 'metadata'
  >
>;

export type AccountSaveUpdate = AccountDetailsUpdate & {
  parentAccountId?: AccountId | null;
};

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

async function getPlainMetadata(
  accountId: AccountId,
  workplaceId: WorkplaceId,
): Promise<Record<string, unknown> | undefined> {
  const meta = await accountQueryRepository.findMetadata(workplaceId, accountId);
  if (!meta) return undefined;

  return {
    statementDay: meta.statementDay,
    dueDay: meta.dueDay,
    minimumPaymentAmount: meta.minimumPaymentAmount,
    minimumBalanceAmount: meta.minimumBalanceAmount,
    creditLimitAmount: meta.creditLimitAmount,
    aprBps: meta.aprBps,
    emiDay: meta.emiDay,
    loanTenureMonths: meta.loanTenureMonths,
    autopayEnabled: meta.autopayEnabled,
    gracePeriodDays: meta.gracePeriodDays,
    payFromAccountId: meta.payFromAccountId,
    minPaymentOnly: meta.minPaymentOnly,
    minimumPaymentPercent: meta.minimumPaymentPercent,
    notes: meta.notes,
  };
}

function buildAccountDetailPayload(
  updates: AccountDetailsUpdate,
): Partial<AccountPersistenceInput> {
  const updatePayload: Partial<AccountPersistenceInput> = {};
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.accountType !== undefined) updatePayload.accountType = updates.accountType;
  if (updates.accountSubtype !== undefined) updatePayload.accountSubtype = updates.accountSubtype;
  if (updates.currencyCode !== undefined) updatePayload.currencyCode = updates.currencyCode;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.icon !== undefined) updatePayload.icon = updates.icon;
  if (updates.color !== undefined) {
    updatePayload.color = updates.color && isValidHexColor(updates.color) ? updates.color : '';
  }
  if (updates.metadata !== undefined) updatePayload.metadata = updates.metadata;
  return updatePayload;
}

function assertDetailOnlyUpdate(updates: AccountDetailsUpdate): void {
  const raw = updates as Record<string, unknown>;
  if ('parentAccountId' in raw || 'orderNum' in raw) {
    throw new Error('Hierarchy fields must be changed with saveAccount or moveAccounts');
  }
}

export type AccountFieldUpdateContext = {
  account: Account;
  updatePayload: Partial<AccountPersistenceInput>;
  beforeState: {
    name: string;
    accountType: Account['accountType'];
    accountSubtype: Account['accountSubtype'];
    currencyCode: string;
    description?: string;
  };
  beforeMetadata: Record<string, unknown> | undefined;
};

function buildAccountUpdateAuditChanges(
  context: AccountFieldUpdateContext,
  after: Partial<CreateAccountData>,
) {
  return {
    before: {
      name: context.beforeState.name,
      accountType: context.beforeState.accountType,
      accountSubtype: context.beforeState.accountSubtype,
      currencyCode: context.beforeState.currencyCode,
      description: context.beforeState.description,
      icon: context.account.icon,
      parentAccountId: context.account.parentAccountId,
      metadata: context.beforeMetadata,
    },
    after,
  };
}

/**
 * Validate parent/type invariants and build the persistence payload.
 * Shared by field-only update and archive compose writes.
 */
export async function prepareAccountFieldUpdate(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  updates: AccountDetailsUpdate,
): Promise<AccountFieldUpdateContext> {
  assertDetailOnlyUpdate(updates);
  const account = await accountQueryRepository.find(workplaceId, accountId);
  if (!account) throw new Error('Account not found');

  const beforeState = {
    name: account.name,
    accountType: account.accountType,
    accountSubtype: account.accountSubtype,
    currencyCode: account.currencyCode,
    description: account.description,
  };

  const isTypeChanging =
    updates.accountType !== undefined && updates.accountType !== account.accountType;

  if (isTypeChanging) {
    const children = await accountQueryRepository.queryByParentId(workplaceId, accountId).fetch();
    if (children.length > 0) {
      throw new Error('Cannot change category or type of an account that has sub-accounts.');
    }
    if (account.parentAccountId) {
      const [parent] = await assertWritable(
        workplaceId,
        [account.parentAccountId],
        'Parent account',
      );
      assertParentMatchesChildType(updates.accountType!, parent);
    }
  }

  const updatePayload = buildAccountDetailPayload(updates);

  if (updates.metadata !== undefined) {
    if (updates.metadata.payFromAccountId) {
      await assertWritable(
        workplaceId,
        [updates.metadata.payFromAccountId],
        'Account metadata pay-from',
      );
    }
    updatePayload.metadata = updates.metadata;
  }

  logger.info('[AccountHierarchyCommand] updateAccount payload prepared', {
    accountId,
    updatePayload,
  });

  const beforeMetadata = await getPlainMetadata(accountId, workplaceId);

  return { account, updatePayload, beforeState, beforeMetadata };
}

/** Analytics + type-change rebuild after a successful field persist. */
export function emitAccountUpdateSideEffects(
  ctx: AccountFieldUpdateContext,
  updates: AccountSaveUpdate,
  workplaceId: WorkplaceId,
): void {
  analytics.trackFeatureUsage('account', 'update', {
    account_type: ctx.beforeState.accountType,
    has_parent: !!updates.parentAccountId,
    fields_updated: Object.keys(updates),
  });

  if (updates.accountType && updates.accountType !== ctx.beforeState.accountType) {
    rebuildQueueService.enqueue(ctx.account.id, 0, workplaceId);
  }
}

/**
 * Hierarchy update command: applies field/parent changes, enforcing self-parent,
 * circular-parent, parent-type, and parent-transaction invariants. Owns account
 * hierarchy mutation, audit, and type-change rebuild policy.
 */
export async function updateAccount(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  updates: AccountDetailsUpdate,
): Promise<Account> {
  const ctx = await prepareAccountFieldUpdate(workplaceId, accountId, updates);

  const updatedAccount = await accountWriteRepository.update(
    ctx.account,
    ctx.updatePayload,
    workplaceId,
    () => [
      auditRepository.prepareLog(
        {
          entityType: 'account',
          entityId: accountId,
          action: AuditAction.UPDATE,
          changes: buildAccountUpdateAuditChanges(ctx, updates),
        },
        workplaceId,
      ),
    ],
  );

  emitAccountUpdateSideEffects(ctx, updates, workplaceId);
  return updatedAccount;
}

/**
 * Atomic form save for details plus optional hierarchy placement. The account,
 * both sibling lists, metadata, and audits commit in one database batch.
 */
export async function saveAccount(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  updates: AccountSaveUpdate,
): Promise<Account> {
  let sideEffectContext: AccountFieldUpdateContext | undefined;
  let sideEffectUpdates: AccountSaveUpdate = updates;

  const saved = await accountTreeTransactionCoordinator.run(workplaceId, async accounts => {
    const snapshot = createAccountTreeSnapshot(accounts);
    const account = snapshot.accountsById.get(accountId);
    if (!account) throw new Error('Account not found');

    const nextType = updates.accountType ?? account.accountType;
    const parentWasSpecified = Object.prototype.hasOwnProperty.call(updates, 'parentAccountId');
    const nextParentId = parentWasSpecified
      ? updates.parentAccountId || undefined
      : account.parentAccountId || undefined;
    const parentChanged = nextParentId !== (account.parentAccountId || undefined);
    const typeChanged = nextType !== account.accountType;

    if (typeChanged && snapshot.getChildren(accountId).length > 0) {
      throw new Error('Cannot change category or type of an account that has sub-accounts.');
    }

    if (nextParentId) {
      assertNotSelfParent(accountId, nextParentId);
      const parent = snapshot.accountsById.get(nextParentId);
      if (!parent) throw new Error('Parent account references missing or deleted account(s)');
      if (parent.deletedAt) {
        throw new Error('Parent account references missing or deleted account(s)');
      }
      if (parent.archivedAt) throw new Error('Archived accounts cannot have new children');
      if (snapshot.getDescendants(accountId).has(nextParentId)) {
        throw new Error('Circular parent relationship detected');
      }
      assertParentMatchesChildType(nextType, parent);
      if (parentChanged) {
        const hasTransactions = await transactionQueryRepository.hasTransactions(
          workplaceId,
          nextParentId,
        );
        if (hasTransactions) assertParentHasNoTransactions(parent.name);
      }
    }

    const payFromAccountId = updates.metadata?.payFromAccountId;
    if (payFromAccountId && !snapshot.accountsById.has(payFromAccountId)) {
      throw new Error(
        `Account metadata pay-from references missing or deleted account(s): ${payFromAccountId}`,
      );
    }

    const beforeState = {
      name: account.name,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      currencyCode: account.currencyCode,
      description: account.description,
    };
    const beforeMetadata = await getPlainMetadata(accountId, workplaceId);
    const detailPayload = buildAccountDetailPayload(updates);
    const plannedDetail = await accountWriteRepository.planUpdate(
      account,
      detailPayload,
      workplaceId,
    );

    const placementChanges =
      parentChanged || typeChanged
        ? planAccountTreePlacementChange(
            accounts,
            {
              accountId,
              parentId: nextParentId || null,
              siblingIndex: snapshot
                .getChildren(nextParentId || null, nextType)
                .filter(sibling => sibling.id !== accountId).length,
              nextAccountType: nextType,
            },
            snapshot,
          )
        : new Map<AccountId, { parentAccountId?: AccountId; orderNum: number }>();

    const context: AccountFieldUpdateContext = {
      account,
      updatePayload: detailPayload,
      beforeState,
      beforeMetadata,
    };
    const currentPlacement = placementChanges.get(accountId);
    const currentUpdates = {
      ...plannedDetail.normalizedUpdates,
      ...(currentPlacement || {}),
    };
    const auditAfter: AccountSaveUpdate & { orderNum?: number } = {
      ...plannedDetail.normalizedUpdates,
      ...(parentWasSpecified || parentChanged ? { parentAccountId: nextParentId || null } : {}),
      ...(currentPlacement ? { orderNum: currentPlacement.orderNum } : {}),
    };
    const currentAudit = buildAccountUpdateAuditChanges(context, auditAfter);

    const ops = [
      ...accountWriteRepository.prepareUpdateBatchOps(
        account,
        currentUpdates,
        plannedDetail.existingMetadata,
      ),
      auditRepository.prepareLog(
        {
          entityType: 'account',
          entityId: accountId,
          action: AuditAction.UPDATE,
          changes: currentAudit,
        },
        workplaceId,
      ),
    ];

    const accountsById = snapshot.accountsById;
    for (const [changedAccountId, placement] of placementChanges) {
      if (changedAccountId === accountId) continue;
      const sibling = accountsById.get(changedAccountId);
      if (!sibling) throw new Error('Account not found');
      const before = {
        parentAccountId: sibling.parentAccountId || undefined,
        orderNum: sibling.orderNum ?? 0,
      };
      ops.push(
        ...accountWriteRepository.prepareUpdateBatchOps(sibling, placement, null),
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: sibling.id,
            action: AuditAction.UPDATE,
            changes: { before, after: placement, reason: 'account_save_tree_normalization' },
          },
          workplaceId,
        ),
      );
    }

    sideEffectContext = context;
    sideEffectUpdates = auditAfter;
    return { ops, result: account };
  });

  if (sideEffectContext) {
    emitAccountUpdateSideEffects(sideEffectContext, sideEffectUpdates, workplaceId);
  }
  return saved;
}

export interface AccountBulkUpdate {
  accountId: AccountId;
  /** Bulk detail edits cannot mutate hierarchy fields. Use moveAccounts. */
  updates: AccountDetailsUpdate;
}

/** Persist one or more structural moves as one atomic tree mutation. */
export async function moveAccounts(
  workplaceId: WorkplaceId,
  accountIds: readonly AccountId[],
  destination: { parentId: AccountId | null; siblingIndex: number },
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
        ops: [],
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
    const before = [];
    const after = [];
    const ops = [];
    for (const [changedAccountId, updates] of changes) {
      const changedAccount = accountsById.get(changedAccountId);
      if (!changedAccount) throw new Error('Account not found');
      const mutation = prepareAccountTreePlacementMutation(changedAccount, updates, workplaceId);
      before.push(mutation.before);
      after.push(mutation.after);
      ops.push(...mutation.ops);
    }
    return {
      ops,
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
export async function saveAccountTreeDraft(
  workplaceId: WorkplaceId,
  baseline: readonly AccountTreeRowState[],
  placements: ReadonlyMap<AccountId, AccountTreePlacement>,
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
      changedAccounts.push(account);
    }

    const ops = changedAccounts.flatMap(account => {
      const placement = placements.get(account.id)!;
      return prepareAccountTreePlacementMutation(
        account,
        placement,
        workplaceId,
        'account_tree_draft_save',
      ).ops;
    });

    return { ops, result: undefined };
  });
}

/** Restore a move only when the affected rows still match its receipt. */
export async function restoreAccountTreeMove(
  workplaceId: WorkplaceId,
  receipt: AccountTreeMoveReceipt,
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

    const ops = [];
    for (const target of receipt.before) {
      const account = accountsById.get(target.accountId);
      if (!account) throw new Error('Account tree changed; undo is no longer available');
      ops.push(
        ...prepareAccountTreePlacementMutation(account, target, workplaceId, 'account_tree_restore')
          .ops,
      );
    }
    return { ops, result: undefined };
  });
}

/**
 * Validate and persist related account updates in one database batch.
 * Callers use this for bulk UI actions so a failed validation cannot leave a
 * selection half-updated.
 */
export async function updateAccounts(
  workplaceId: WorkplaceId,
  requests: AccountBulkUpdate[],
): Promise<Account[]> {
  if (requests.length === 0) return [];

  // Structural fields belong to moveAccounts. Keep a runtime guard in
  // addition to the type-level omission because imports and JS callers can
  // bypass TypeScript.
  for (const request of requests) {
    const updates = request.updates as Record<string, unknown>;
    if ('parentAccountId' in updates || 'orderNum' in updates) {
      throw new Error('Hierarchy fields must be changed with moveAccounts');
    }
  }

  const contexts = await Promise.all(
    requests.map(request =>
      prepareAccountFieldUpdate(workplaceId, request.accountId, request.updates),
    ),
  );
  const planned = await Promise.all(
    contexts.map(async context => ({
      context,
      update: await accountWriteRepository.planUpdate(
        context.account,
        context.updatePayload,
        workplaceId,
      ),
    })),
  );

  await persistBatch(() => [
    ...planned.flatMap(({ context, update }) =>
      accountWriteRepository.prepareUpdateBatchOps(
        context.account,
        update.normalizedUpdates,
        update.existingMetadata,
      ),
    ),
    ...planned.map(({ context, update }) =>
      auditRepository.prepareLog(
        {
          entityType: 'account',
          entityId: context.account.id,
          action: AuditAction.UPDATE,
          changes: buildAccountUpdateAuditChanges(context, update.normalizedUpdates),
        },
        workplaceId,
      ),
    ),
  ]);

  planned.forEach(({ context, update }) => {
    emitAccountUpdateSideEffects(context, update.normalizedUpdates, workplaceId);
  });

  return planned.map(({ context }) => context.account);
}
