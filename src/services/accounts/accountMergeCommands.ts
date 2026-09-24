import Account from '@/src/data/models/Account';
import { AccountType } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { journalPersistenceRepository } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
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
 * Merge command: validates eligibility, then asks each owning repository to
 * stage its account-reference changes in one accounting write session. The
 * journal repository checks affected posted journals before any row is written.
 * Reference-site coverage stays driven by the account reference graph.
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

  await runAccountingWriteSession(async session => {
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

    const writes: Promise<void>[] = [];
    if (prepareKinds.has('transactions')) {
      writes.push(
        journalPersistenceRepository.retargetAccountsForMergeInSession(
          session,
          workplaceId,
          filteredSourceIds,
          targetAccountId,
        ),
      );
    }
    if (prepareKinds.has('plannedPayments')) {
      writes.push(
        plannedPaymentRepository.mergeAccountsInSession(
          session,
          workplaceId,
          filteredSourceIds,
          targetAccountId,
        ),
      );
    }
    if (prepareKinds.has('smsRules')) {
      writes.push(
        transactionAutoPostRuleRepository.mergeAccountsInSession(
          session,
          workplaceId,
          filteredSourceIds,
          targetAccountId,
        ),
      );
    }
    if (prepareKinds.has('budgets')) {
      writes.push(
        budgetRepository.mergeAccountsInSession(
          session,
          workplaceId,
          filteredSourceIds,
          targetAccountId,
        ),
      );
    }
    if (prepareKinds.has('accounts')) {
      writes.push(
        accountWriteRepository.mergeInSession(
          session,
          workplaceId,
          filteredSourceIds,
          targetAccountId,
        ),
      );
    }
    if (prepareKinds.has('snapshots')) {
      writes.push(
        balanceSnapshotRepository.deleteForAccountMergeInSession(session, workplaceId, [
          ...filteredSourceIds,
          targetAccountId,
        ]),
      );
    }
    await Promise.all(writes);
  });

  rebuildQueueService.enqueue(targetAccountId, 0, workplaceId);

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
