import Account from '@/src/data/models/Account';
import { AuditAction } from '@/src/data/models/AuditLog';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { analytics } from '@/src/services/analytics-service';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import {
  AccountReferenceSiteKey,
  referenceSites,
} from '@/src/services/accounts/accountReferenceGraph';
import {
  assertMergeAccountsCompatible,
  dedupeMergeSourceAccountIds,
} from '@/src/services/accounts/accountRules';
import { budgetWriteService } from '@/src/services/budget/budgetWriteService';
import { preparePlannedPaymentMergeOperations } from '@/src/services/planned-payment/plannedPaymentMergeOperations';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/utils/logger';
import { Model } from '@nozbe/watermelondb';

/**
 * Merge rewrite/destroy preparers keyed by Account reference site.
 * Multiple sites may share one preparer; iteration of `referenceSites` decides
 * which run — rewrite ops stay here, not in the graph.
 */
type MergePrepareKind =
  'transactions' | 'plannedPayments' | 'smsRules' | 'budgets' | 'accounts' | 'snapshots';

const MERGE_PREPARE_BY_SITE: Partial<Record<AccountReferenceSiteKey, MergePrepareKind>> = {
  'account.parentAccountId': 'accounts',
  'transaction.accountId': 'transactions',
  'budgetScope.accountId': 'budgets',
  'budget.assetAccountIds': 'budgets',
  'accountMetadata.payFromAccountId': 'accounts',
  'plannedPayment.fromAccountId': 'plannedPayments',
  'plannedPayment.toAccountId': 'plannedPayments',
  'balanceSnapshot.accountId': 'snapshots',
  'transactionAutoPostRule.sourceAccountId': 'smsRules',
  'transactionAutoPostRule.categoryAccountId': 'smsRules',
};

function mergePrepareKindsFromSites(): Set<MergePrepareKind> {
  const kinds = new Set<MergePrepareKind>();
  for (const site of referenceSites()) {
    if (site.mergeBehavior === 'none') continue;
    const kind = MERGE_PREPARE_BY_SITE[site.key];
    if (!kind) {
      throw new Error(
        `Account merge is missing a rewrite preparer for reference site "${site.key}"`,
      );
    }
    kinds.add(kind);
  }
  return kinds;
}

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
 * Sites to retarget/destroy come from `referenceSites`; Watermelon prepareUpdate
 * ops stay in this command / existing preparers.
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

  const prepareKinds = mergePrepareKindsFromSites();

  const prepareTasks: Promise<Model[]>[] = [];

  if (prepareKinds.has('transactions')) {
    prepareTasks.push(
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
    );
  }
  if (prepareKinds.has('plannedPayments')) {
    prepareTasks.push(
      preparePlannedPaymentMergeOperations(
        workplaceId,
        filteredSourceIds,
        targetAccountId,
      ) as Promise<Model[]>,
    );
  }
  if (prepareKinds.has('smsRules')) {
    prepareTasks.push(
      transactionAutoPostRuleRepository.prepareMergeOperations(
        workplaceId,
        filteredSourceIds,
        targetAccountId,
      ) as Promise<Model[]>,
    );
  }
  if (prepareKinds.has('budgets')) {
    prepareTasks.push(
      budgetWriteService.prepareMergeOperations(
        workplaceId,
        filteredSourceIds,
        targetAccountId,
      ) as Promise<Model[]>,
    );
  }
  if (prepareKinds.has('accounts')) {
    prepareTasks.push(
      accountRepository.prepareMergeOperations(
        workplaceId,
        filteredSourceIds,
        targetAccountId,
      ) as Promise<Model[]>,
    );
  }
  if (prepareKinds.has('snapshots')) {
    prepareTasks.push(
      balanceSnapshotRepository.prepareMergeOperations(workplaceId, [
        ...filteredSourceIds,
        targetAccountId,
      ]) as Promise<Model[]>,
    );
  }

  const opGroups = await Promise.all(prepareTasks);
  const auditOp = auditRepository.prepareLog(
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

  await persistBatch([...opGroups.flat(), auditOp], () => {
    rebuildQueueService.enqueue(targetAccountId, 0, workplaceId);
  });

  analytics.trackFeatureUsage('account', 'merge', {
    source_count: filteredSourceIds.length,
    account_type: targetAccount?.accountType || AccountType.ASSET,
  });

  logger.info('[AccountMergeCommand] mergeAccounts completed successfully', {
    targetAccountId,
    movedCount: filteredSourceIds.length,
  });
}
