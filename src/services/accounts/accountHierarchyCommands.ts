import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import {
  AccountPersistenceInput,
  accountRepository,
} from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { analytics } from '@/src/services/analytics-service';
import { CreateAccountData } from '@/src/services/accounts/accountCommands';
import {
  assertNotSelfParent,
  assertParentHasNoTransactions,
  assertParentMatchesChildType,
} from '@/src/services/accounts/accountRules';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { auditService } from '@/src/services/audit-service';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';

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
  const account = await accountRepository.find(workplaceId, accountId);
  if (!account) throw new Error('Account not found');

  const beforeState = {
    name: account.name,
    accountType: account.accountType,
    accountSubtype: account.accountSubtype,
    currencyCode: account.currencyCode,
    description: account.description,
  };

  // Validate parent account if updated (existence via graph; circular/self stay here)
  if (updates.parentAccountId) {
    assertNotSelfParent(accountId, updates.parentAccountId);
    const [parent] = await assertWritable(workplaceId, [updates.parentAccountId], 'Parent account');

    const isCircular = await isDescendant(updates.parentAccountId, accountId, workplaceId);
    if (isCircular) {
      throw new Error('Circular parent relationship detected');
    }

    const newType = updates.accountType || account.accountType;
    assertParentMatchesChildType(newType, parent);

    const hasTransactions = await transactionRepository.hasTransactions(
      workplaceId,
      updates.parentAccountId,
    );
    if (hasTransactions) {
      assertParentHasNoTransactions(parent.name);
    }
  }

  // Build update object selectively to avoid overwriting existing fields with undefined
  const updatePayload: Partial<AccountPersistenceInput> = {};
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.accountType !== undefined) updatePayload.accountType = updates.accountType;
  if (updates.accountSubtype !== undefined) updatePayload.accountSubtype = updates.accountSubtype;
  if (updates.currencyCode !== undefined) updatePayload.currencyCode = updates.currencyCode;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.icon !== undefined) updatePayload.icon = updates.icon;
  if (updates.orderNum !== undefined) updatePayload.orderNum = updates.orderNum;

  // Handle parentAccountId specifically as it can be null (to clear parent)
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
  const updatedAccount = await accountRepository.update(account, updatePayload, workplaceId);

  await auditService.log(
    {
      entityType: 'account',
      entityId: accountId,
      action: AuditAction.UPDATE,
      changes: {
        before: {
          name: beforeState.name,
          accountType: beforeState.accountType,
          accountSubtype: beforeState.accountSubtype,
          currencyCode: beforeState.currencyCode,
          description: beforeState.description,
          icon: account.icon,
          parentAccountId: account.parentAccountId,
          metadata: await getPlainMetadata(accountId, workplaceId),
        },
        after: updates,
      },
    },
    workplaceId,
  );

  // Track Analytics
  analytics.trackFeatureUsage('account', 'update', {
    account_type: beforeState.accountType,
    has_parent: !!updates.parentAccountId,
    fields_updated: Object.keys(updates),
  });

  if (updates.accountType && updates.accountType !== beforeState.accountType) {
    rebuildQueueService.enqueue(account.id, 0, workplaceId);
  }

  return updatedAccount;
}

/**
 * Reorder command: updates an account's sibling ordering and audits the change.
 */
export async function updateAccountOrder(
  workplaceId: WorkplaceId,
  account: Account,
  newOrder: number,
): Promise<void> {
  await accountRepository.update(account, { orderNum: newOrder }, workplaceId);

  await auditService.log(
    {
      entityType: 'account',
      entityId: account.id,
      action: AuditAction.UPDATE,
      changes: {
        before: { orderNum: account.orderNum },
        after: { orderNum: newOrder },
      },
    },
    workplaceId,
  );
}
