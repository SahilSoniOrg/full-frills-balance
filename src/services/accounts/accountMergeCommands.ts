import Account from '@/src/data/models/Account';
import { AuditAction, AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionWriteRepository } from '@/src/data/repositories/transaction';
import { analytics } from '@/src/services/analytics';
import {
  AccountReferenceSiteKey,
  assertNoLiveAccountReferences,
  referenceSites,
} from '@/src/services/accounts/accountReferenceGraph';
import {
  assertMergeAccountsCompatible,
  assertMergeAccountsHaveSameHierarchyRole,
  assertMergeDoesNotCreateHierarchyCycle,
  dedupeMergeSourceAccountIds,
} from '@/src/services/accounts/accountRules';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { logger } from '@/src/utils/logger';
import { Model } from '@nozbe/watermelondb';

/**
 * Merge rewrite/destroy paths keyed by Account reference site.
 * Multiple sites may share one path; iteration of `referenceSites` decides
 * which paths are required.
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
  const target = targetAccount ?? (await accountQueryRepository.find(workplaceId, targetAccountId));
  const sources =
    sourceAccounts ?? (await accountQueryRepository.findAllByIds(workplaceId, sourceAccountIds));

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
 * Sites to retarget/destroy come from `referenceSites`. The command loads all
 * records before preparing one database batch so failed preparation cannot
 * leave a partially-mutated merge.
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

  const prepareKinds = mergePrepareKindsFromSites();
  let targetAccountType: AccountType = AccountType.ASSET;

  await persistBatch(
    async () => {
      const [currentTarget, sourceAccounts] = await Promise.all([
        accountQueryRepository.find(workplaceId, targetAccountId),
        accountQueryRepository.findAllByIds(workplaceId, filteredSourceIds),
      ]);
      targetAccountType = currentTarget?.accountType ?? AccountType.ASSET;
      const allAccounts = await accountQueryRepository.findAll(workplaceId);
      await validateMergeEligibility(
        workplaceId,
        targetAccountId,
        filteredSourceIds,
        currentTarget,
        sourceAccounts,
      );
      assertMergeAccountsHaveSameHierarchyRole(targetAccountId, filteredSourceIds, allAccounts);
      assertMergeDoesNotCreateHierarchyCycle(targetAccountId, filteredSourceIds, allAccounts);
      const [transactions, plannedPayments, smsRules, budgets, accounts, snapshots] =
        await Promise.all([
          prepareKinds.has('transactions')
            ? transactionWriteRepository.loadMergeRecords(workplaceId, filteredSourceIds)
            : Promise.resolve(null),
          prepareKinds.has('plannedPayments')
            ? plannedPaymentRepository.loadMergeRecords(
                workplaceId,
                filteredSourceIds,
                targetAccountId,
              )
            : Promise.resolve(null),
          prepareKinds.has('smsRules')
            ? transactionAutoPostRuleRepository.loadMergeRecords(workplaceId, filteredSourceIds)
            : Promise.resolve(null),
          prepareKinds.has('budgets')
            ? budgetRepository.loadMergeRecords(workplaceId, filteredSourceIds, targetAccountId)
            : Promise.resolve(null),
          prepareKinds.has('accounts')
            ? accountWriteRepository.loadMergeRecords(
                workplaceId,
                filteredSourceIds,
                targetAccountId,
              )
            : Promise.resolve(null),
          prepareKinds.has('snapshots')
            ? balanceSnapshotRepository.loadMergeRecords(workplaceId, [
                ...filteredSourceIds,
                targetAccountId,
              ])
            : Promise.resolve(null),
        ]);

      const opGroups: Model[][] = [];
      if (transactions) {
        opGroups.push(
          transactionWriteRepository.prepareLoadedMergeOperations(transactions, targetAccountId),
        );
      }
      if (plannedPayments) {
        opGroups.push(
          plannedPaymentRepository.prepareLoadedMergeOperations(
            plannedPayments,
            filteredSourceIds,
            targetAccountId,
          ),
        );
      }
      if (smsRules) {
        opGroups.push(
          transactionAutoPostRuleRepository.prepareLoadedMergeOperations(
            smsRules,
            filteredSourceIds,
            targetAccountId,
          ),
        );
      }
      if (budgets) {
        opGroups.push(
          budgetRepository.prepareLoadedMergeOperations(
            budgets,
            filteredSourceIds,
            targetAccountId,
          ),
        );
      }
      if (accounts) {
        opGroups.push(
          accountWriteRepository.prepareLoadedMergeOperations(
            accounts,
            filteredSourceIds,
            targetAccountId,
          ),
        );
      }
      if (snapshots) {
        opGroups.push(balanceSnapshotRepository.prepareLoadedMergeOperations(snapshots));
      }

      const auditOp = auditRepository.prepareLog(
        {
          entityType: 'account',
          entityId: targetAccountId,
          action: AuditAction.UPDATE,
          changes: { action: 'MERGE_ACCOUNTS', mergedAccountIds: filteredSourceIds },
        },
        workplaceId,
      );
      return [...opGroups.flat(), auditOp];
    },
    () => rebuildQueueService.enqueue(targetAccountId, 0, workplaceId),
  );

  try {
    await assertNoLiveAccountReferences(workplaceId, filteredSourceIds);
  } catch (error) {
    logger.error('[AccountMergeCommand] Post-merge reference invariant failed', error, {
      workplaceId,
      targetAccountId,
      sourceAccountIds: filteredSourceIds,
    });
  }

  analytics.trackFeatureUsage('account', 'merge', {
    source_count: filteredSourceIds.length,
    account_type: targetAccountType,
  });

  logger.info('[AccountMergeCommand] mergeAccounts completed successfully', {
    targetAccountId,
    movedCount: filteredSourceIds.length,
  });
}
