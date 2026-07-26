import { database } from '@/src/data/database/Database';
import Account, { AccountType } from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { analytics } from '@/src/services/analytics-service';
import {
  assertMergeAccountsCompatible,
  dedupeMergeSourceAccountIds,
} from '@/src/services/accounts/accountRules';
import { auditService } from '@/src/services/audit-service';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';

async function validateMergeEligibility(
  workplaceId: WorkplaceId,
  targetAccountId: AccountId,
  sourceAccountIds: AccountId[],
  targetAccount?: Account | null,
  sourceAccounts?: Account[],
): Promise<void> {
  const target = targetAccount ?? (await accountRepository.find(workplaceId, targetAccountId));
  const sources =
    sourceAccounts ?? (await accountRepository.findAllByIds(workplaceId, sourceAccountIds));

  assertMergeAccountsCompatible(
    workplaceId,
    targetAccountId,
    target,
    sources,
    sourceAccountIds.length,
  );
}

/**
 * Merge command: moves transactions, planned payments, rules, budgets, and
 * snapshots from source accounts into a target account atomically, then queues
 * a rebuild. Owns merge eligibility and dependent-record migration policy.
 */
export async function mergeAccounts(
  workplaceId: WorkplaceId,
  targetAccountId: AccountId,
  sourceAccountIds: AccountId[],
): Promise<void> {
  logger.info('[AccountMergeCommand] mergeAccounts requested', {
    workplaceId,
    targetAccountId,
    sourceAccountIds,
  });

  const filteredSourceIds = dedupeMergeSourceAccountIds(targetAccountId, sourceAccountIds);
  if (filteredSourceIds.length === 0) {
    logger.info('[AccountMergeCommand] No valid source accounts to merge.');
    return;
  }

  const [targetAccount, sourceAccounts] = await Promise.all([
    accountRepository.find(workplaceId, targetAccountId),
    accountRepository.findAllByIds(workplaceId, filteredSourceIds),
  ]);

  await validateMergeEligibility(
    workplaceId,
    targetAccountId,
    filteredSourceIds,
    targetAccount,
    sourceAccounts,
  );

  await database.write(async () => {
    const [transactionOps, plannedOps, smsOps, budgetOps, accountOps, snapshotOps] =
      await Promise.all([
        (async () => {
          const transactions = await transactionRepository.findAllByAccountIds(
            workplaceId,
            filteredSourceIds,
          );
          return transactions.map(tx =>
            tx.prepareUpdate(r => {
              r.accountId = targetAccountId;
              r.runningBalance = null;
              r.updatedAt = new Date();
            }),
          );
        })(),
        plannedPaymentService.prepareMergeOperations(
          workplaceId,
          filteredSourceIds,
          targetAccountId,
        ),
        transactionAutoPostRuleRepository.prepareMergeOperations(
          workplaceId,
          filteredSourceIds,
          targetAccountId,
        ),
        budgetWriteService.prepareMergeOperations(workplaceId, filteredSourceIds, targetAccountId),
        accountRepository.prepareMergeOperations(workplaceId, filteredSourceIds, targetAccountId),
        balanceSnapshotRepository.prepareMergeOperations(workplaceId, [
          ...filteredSourceIds,
          targetAccountId,
        ]),
      ]);

    await database.batch([
      ...transactionOps,
      ...plannedOps,
      ...smsOps,
      ...budgetOps,
      ...accountOps,
      ...snapshotOps,
    ]);
  });

  rebuildQueueService.enqueue(targetAccountId, 0, workplaceId);

  await auditService.log(
    {
      entityType: 'account',
      entityId: targetAccountId,
      action: AuditAction.UPDATE,
      changes: {
        action: 'MERGE_ACCOUNTS',
        mergedAccountIds: filteredSourceIds,
      },
    },
    workplaceId,
  );

  analytics.trackFeatureUsage('account', 'merge', {
    source_count: filteredSourceIds.length,
    account_type: targetAccount?.accountType || AccountType.ASSET,
  });

  logger.info('[AccountMergeCommand] mergeAccounts completed successfully', {
    targetAccountId,
    movedCount: filteredSourceIds.length,
  });
}
