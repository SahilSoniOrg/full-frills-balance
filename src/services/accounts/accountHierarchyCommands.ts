import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import { database } from '@/src/data/database/Database';
import {
  AccountPersistenceInput,
  accountRepository,
} from '@/src/data/repositories/AccountRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import { CreateAccountData } from '@/src/services/accounts/accountCommands';
import {
  assertNotSelfParent,
  assertParentHasNoTransactions,
  assertParentMatchesChildType,
} from '@/src/services/accounts/accountRules';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { isValidHexColor } from '@/src/utils/accountCategory';

async function isDescendant(
  potentialParentId: AccountId,
  potentialDescendantId: AccountId,
  workplaceId: WorkplaceId,
): Promise<boolean> {
  if (potentialParentId === potentialDescendantId) return true;

  let currentParentId: AccountId | undefined = potentialParentId;
  const visited = new Set<AccountId>();

  while (currentParentId) {
    if (currentParentId === potentialDescendantId) return true;
    if (visited.has(currentParentId)) break;
    visited.add(currentParentId);

    const parent = await accountRepository.find(workplaceId, currentParentId);
    currentParentId = parent?.parentAccountId;
  }

  return false;
}

async function getPlainMetadata(
  accountId: AccountId,
  workplaceId: WorkplaceId,
): Promise<Record<string, any> | undefined> {
  const meta = await accountRepository.findMetadata(workplaceId, accountId);
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
  beforeMetadata: Record<string, any> | undefined;
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
  updates: Partial<CreateAccountData>,
): Promise<AccountFieldUpdateContext> {
  const account = await accountRepository.find(workplaceId, accountId);
  if (!account) throw new Error('Account not found');

  const beforeState = {
    name: account.name,
    accountType: account.accountType,
    accountSubtype: account.accountSubtype,
    currencyCode: account.currencyCode,
    description: account.description,
  };

  const targetType = updates.accountType || account.accountType;
  const isTypeChanging =
    updates.accountType !== undefined && updates.accountType !== account.accountType;

  if (isTypeChanging) {
    const children = await accountRepository.queryByParentId(workplaceId, accountId).fetch();
    if (children.length > 0) {
      throw new Error('Cannot change category or type of an account that has sub-accounts.');
    }
  }

  const effectiveParentId =
    updates.parentAccountId !== undefined
      ? updates.parentAccountId || undefined
      : account.parentAccountId;

  if (effectiveParentId) {
    if (updates.parentAccountId) {
      assertNotSelfParent(accountId, updates.parentAccountId);
    }
    const [parent] = await assertWritable(workplaceId, [effectiveParentId], 'Parent account');

    if (updates.parentAccountId) {
      const isCircular = await isDescendant(updates.parentAccountId, accountId, workplaceId);
      if (isCircular) {
        throw new Error('Circular parent relationship detected');
      }

      const hasTransactions = await transactionRepository.hasTransactions(
        workplaceId,
        updates.parentAccountId,
      );
      if (hasTransactions) {
        assertParentHasNoTransactions(parent.name);
      }
    }

    assertParentMatchesChildType(targetType, parent);
  }

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
  if (updates.orderNum !== undefined) updatePayload.orderNum = updates.orderNum;

  if (updates.parentAccountId !== undefined) {
    updatePayload.parentAccountId = updates.parentAccountId || undefined;
  }

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
  updates: Partial<CreateAccountData>,
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
  updates: Partial<CreateAccountData>,
): Promise<Account> {
  const ctx = await prepareAccountFieldUpdate(workplaceId, accountId, updates);

  const updatedAccount = await accountRepository.update(
    ctx.account,
    ctx.updatePayload,
    workplaceId,
  );

  await auditService.log(
    {
      entityType: 'account',
      entityId: accountId,
      action: AuditAction.UPDATE,
      changes: buildAccountUpdateAuditChanges(ctx, updates),
    },
    workplaceId,
  );

  emitAccountUpdateSideEffects(ctx, updates, workplaceId);
  return updatedAccount;
}

export interface AccountBulkUpdate {
  accountId: AccountId;
  updates: Partial<CreateAccountData>;
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

  const contexts = await Promise.all(
    requests.map(request =>
      prepareAccountFieldUpdate(workplaceId, request.accountId, request.updates),
    ),
  );
  const planned = await Promise.all(
    contexts.map(async context => ({
      context,
      update: await accountRepository.planUpdate(
        context.account,
        context.updatePayload,
        workplaceId,
      ),
    })),
  );

  await database.write(async () => {
    const operations = planned.flatMap(({ context, update }) =>
      accountRepository.prepareUpdateBatchOps(
        context.account,
        update.normalizedUpdates,
        update.existingMetadata,
      ),
    );
    const auditLogs = planned.map(({ context, update }) =>
      auditRepository.prepareLog(
        {
          entityType: 'account',
          entityId: context.account.id,
          action: AuditAction.UPDATE,
          changes: buildAccountUpdateAuditChanges(context, update.normalizedUpdates),
        },
        workplaceId,
      ),
    );

    await database.batch(...operations, ...auditLogs);
  });

  planned.forEach(({ context, update }) => {
    emitAccountUpdateSideEffects(context, update.normalizedUpdates, workplaceId);
  });

  return planned.map(({ context }) => context.account);
}

/**
 * Reorder command: updates an account's sibling ordering and audits the change.
 */
export async function updateAccountOrder(
  workplaceId: WorkplaceId,
  account: Account,
  newOrder: number,
): Promise<void> {
  const previousOrderNum = account.orderNum;

  await accountRepository.update(account, { orderNum: newOrder }, workplaceId);

  await auditService.log(
    {
      entityType: 'account',
      entityId: account.id,
      action: AuditAction.UPDATE,
      changes: {
        before: { orderNum: previousOrderNum },
        after: { orderNum: newOrder },
      },
    },
    workplaceId,
  );
}
