import { matcherEligibilityChanged } from '@/src/services/accounts/accountMatcherEligibility';
import {
  withAccountRecognitionRefreshIf,
  withAccountRecognitionRefreshWhen,
} from '@/src/services/accounts/accountRecognitionRefresh';
import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import {
  accountQueryRepository,
  accountTreeTransactionCoordinator,
  accountWriteRepository,
} from '@/src/data/repositories/account';
import type { AccountMutationCommitFacts } from '@/src/data/repositories/account/AccountWriteRepository';
import type { AccountPersistenceInput } from '@/src/data/repositories/account/types';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { analytics } from '@/src/services/analytics';
import type { CreateAccountCommandInput } from '@/src/services/accounts/accountCommands';
import {
  assertNotSelfParent,
  assertParentHasNoTransactions,
  assertParentMatchesChildType,
} from '@/src/services/accounts/accountRules';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import type { PlainAccountMetadata } from '@/src/types/plainDtos';
import { accountMetadataAuditState } from '@/src/utils/accountMetadataAuditState';
import { isValidHexColor } from '@/src/utils/accountCategory';
import {
  createAccountTreeSnapshot,
  planAccountTreePlacementChange,
} from '@/src/services/accounts/accountTree';

export type AccountDetailsUpdate = Partial<
  Pick<
    CreateAccountCommandInput,
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

type AccountPersistedFieldUpdate = {
  name?: string;
  accountType?: AccountPersistenceInput['accountType'];
  accountSubtype?: AccountPersistenceInput['accountSubtype'];
  currencyCode?: string;
  description?: AccountPersistenceInput['description'];
  icon?: AccountPersistenceInput['icon'];
  color?: string;
  metadata?: AccountPersistenceInput['metadata'];
  parentAccountId?: AccountId | null;
  orderNum?: AccountPersistenceInput['orderNum'];
};

async function getPlainMetadata(
  accountId: AccountId,
  workplaceId: WorkplaceId,
): Promise<Omit<PlainAccountMetadata, 'accountId'> | undefined> {
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
    color?: string;
  };
  beforeMetadata: Omit<PlainAccountMetadata, 'accountId'> | undefined;
};

function buildAccountUpdateAuditChanges(
  context: AccountFieldUpdateContext,
  after: AccountPersistedFieldUpdate,
) {
  const auditAfter = { ...after };
  if (Object.prototype.hasOwnProperty.call(after, 'metadata')) {
    auditAfter.metadata =
      after.metadata === null
        ? null
        : {
            ...accountMetadataAuditState(context.beforeMetadata ?? {}),
            ...after.metadata,
          };
  }
  return {
    before: {
      name: context.beforeState.name,
      accountType: context.beforeState.accountType,
      accountSubtype: context.beforeState.accountSubtype,
      currencyCode: context.beforeState.currencyCode,
      description: context.beforeState.description,
      color: context.beforeState.color,
      icon: context.account.icon,
      parentAccountId: context.account.parentAccountId,
      metadata: context.beforeMetadata ? accountMetadataAuditState(context.beforeMetadata) : null,
    },
    after: auditAfter,
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
    color: account.color,
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

  const beforeMetadata = await getPlainMetadata(accountId, workplaceId);

  return { account, updatePayload, beforeState, beforeMetadata };
}

/** Analytics + type-change rebuild after a successful field persist. */
export function emitAccountUpdateSideEffects(
  ctx: AccountFieldUpdateContext,
  updates: AccountPersistedFieldUpdate,
  workplaceId: WorkplaceId,
  commitFacts: AccountMutationCommitFacts,
): void {
  analytics.trackFeatureUsage('account', 'update', {
    account_type: ctx.beforeState.accountType,
    has_parent: !!updates.parentAccountId,
    fields_updated: Object.keys(updates),
  });

  for (const accountId of commitFacts.balanceRebuildAccountIds) {
    rebuildQueueService.enqueue(accountId, 0, workplaceId);
  }
}

/**
 * Hierarchy update command: applies field/parent changes, enforcing self-parent,
 * circular-parent, parent-type, and parent-transaction invariants. Owns account
 * hierarchy mutation, audit, and type-change rebuild policy.
 */
async function updateAccountCore(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  updates: AccountDetailsUpdate,
): Promise<Account> {
  const ctx = await prepareAccountFieldUpdate(workplaceId, accountId, updates);

  const mutation = await accountWriteRepository.update(
    ctx.account,
    ctx.updatePayload,
    workplaceId,
    {
      audit: {
        action: AuditAction.UPDATE,
        changes: buildAccountUpdateAuditChanges(ctx, updates),
      },
    },
  );

  emitAccountUpdateSideEffects(ctx, updates, workplaceId, mutation.commitFacts);
  return mutation.account;
}

/**
 * Atomic form save for details plus optional hierarchy placement. The account,
 * both sibling lists, metadata, and audits commit in one database batch.
 */
async function saveAccountCore(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  updates: AccountSaveUpdate,
  invalidate: () => void,
): Promise<Account> {
  let sideEffectContext: AccountFieldUpdateContext | undefined;
  let sideEffectUpdates: AccountPersistedFieldUpdate = updates;
  let sideEffectCommitFacts: AccountMutationCommitFacts | undefined;

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
    if (
      matcherEligibilityChanged({
        ...(parentChanged ? { parentAccountId: nextParentId ?? null } : {}),
        ...(typeChanged ? { accountType: nextType } : {}),
      })
    ) {
      invalidate();
    }

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
      color: account.color,
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
    const auditAfter: AccountPersistedFieldUpdate = {
      ...plannedDetail.normalizedUpdates,
      ...(parentWasSpecified || parentChanged ? { parentAccountId: nextParentId || null } : {}),
      ...(currentPlacement ? { orderNum: currentPlacement.orderNum } : {}),
    };
    const currentAudit = buildAccountUpdateAuditChanges(context, auditAfter);

    const accountsById = snapshot.accountsById;
    const siblingChanges = [...placementChanges]
      .filter(([changedAccountId]) => changedAccountId !== accountId)
      .map(([changedAccountId, placement]) => {
        const sibling = accountsById.get(changedAccountId);
        if (!sibling) throw new Error('Account not found');
        return {
          sibling,
          placement,
          before: {
            parentAccountId: sibling.parentAccountId || undefined,
            orderNum: sibling.orderNum ?? 0,
          },
        };
      });

    const prepareOps = () => {
      const ops = [
        ...accountWriteRepository.prepareUpdateBatchOps(
          account,
          currentUpdates,
          plannedDetail.existingMetadata,
          plannedDetail,
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

      for (const { sibling, placement, before } of siblingChanges) {
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

      return ops;
    };

    sideEffectContext = context;
    sideEffectUpdates = auditAfter;
    sideEffectCommitFacts = plannedDetail.commitFacts;
    return { prepareOps, result: account };
  });

  if (sideEffectContext && sideEffectCommitFacts) {
    emitAccountUpdateSideEffects(
      sideEffectContext,
      sideEffectUpdates,
      workplaceId,
      sideEffectCommitFacts,
    );
  }
  return saved;
}

export interface AccountBulkUpdate {
  accountId: AccountId;
  /** Bulk detail edits cannot mutate hierarchy fields. Use moveAccounts. */
  updates: AccountDetailsUpdate;
}

/**
 * Validate and persist related account updates in one database batch.
 * Callers use this for bulk UI actions so a failed validation cannot leave a
 * selection half-updated.
 */
async function updateAccountsCore(
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
  const planned = await accountWriteRepository.commitMutationPlan(async () => {
    const updates = await Promise.all(
      contexts.map(async context => ({
        context,
        update: await accountWriteRepository.planUpdate(
          context.account,
          context.updatePayload,
          workplaceId,
        ),
      })),
    );
    return {
      prepareOps: () => [
        ...updates.flatMap(({ context, update }) =>
          accountWriteRepository.prepareUpdateBatchOps(
            context.account,
            update.normalizedUpdates,
            update.existingMetadata,
            update,
          ),
        ),
        ...updates.map(({ context, update }) =>
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
      ],
      result: updates,
    };
  });

  planned.forEach(({ context, update }) => {
    emitAccountUpdateSideEffects(
      context,
      update.normalizedUpdates,
      workplaceId,
      update.commitFacts,
    );
  });

  return planned.map(({ context }) => context.account);
}

export const updateAccount = (...args: Parameters<typeof updateAccountCore>) =>
  withAccountRecognitionRefreshIf(args[0], matcherEligibilityChanged(args[2]), () =>
    updateAccountCore(...args),
  );

export function saveAccount(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  updates: AccountSaveUpdate,
): Promise<Account> {
  return withAccountRecognitionRefreshWhen(workplaceId, invalidate =>
    saveAccountCore(workplaceId, accountId, updates, invalidate),
  );
}

export {
  moveAccount,
  moveAccounts,
  saveAccountTreeDraft,
  restoreAccountTreeMove,
} from './accountTreeCommands';

export const updateAccounts = (...args: Parameters<typeof updateAccountsCore>) =>
  withAccountRecognitionRefreshIf(
    args[0],
    args[1].some(request => matcherEligibilityChanged(request.updates)),
    () => updateAccountsCore(...args),
  );
