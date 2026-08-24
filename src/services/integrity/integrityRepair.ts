import AuditLog from '@/src/data/models/AuditLog';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AuditAction } from '@/src/types/enums';
import { logger } from '@/src/utils/logger';
import { BalanceVerificationResult, IntegrityRepairTrigger } from './types';
import { verifyAccountBalance } from './integrityVerification';

/**
 * Prepares a successful running-balance integrity repair for the same writer as the rebuild.
 */
export function prepareRunningBalanceRepair(
  workplaceId: WorkplaceId,
  discrepancy: BalanceVerificationResult,
  trigger: IntegrityRepairTrigger,
): AuditLog {
  return auditRepository.prepareLog(
    {
      entityType: 'account',
      entityId: discrepancy.accountId,
      action: AuditAction.UPDATE,
      changes: {
        before: {
          cachedBalance: discrepancy.cachedBalance,
          computedBalance: discrepancy.computedBalance,
          discrepancy: discrepancy.discrepancy,
          snapshotCorrupted: discrepancy.snapshotCorrupted ?? false,
        },
        after: {
          repairType: 'running_balance',
          trigger,
          accountName: discrepancy.accountName,
          balanceAfterRepair: discrepancy.computedBalance,
        },
      },
    },
    workplaceId,
  );
}

/**
 * Repairs a single account's running balances.
 */
export async function repairAccountBalance(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  verification?: BalanceVerificationResult,
  auditTrigger: IntegrityRepairTrigger = 'repair',
  signal?: AbortSignal,
  isCurrent?: () => boolean,
): Promise<boolean> {
  if (signal?.aborted || isCurrent?.() === false) return false;

  const discrepancy = verification ?? (await verifyAccountBalance(accountId, workplaceId));
  if (signal?.aborted || isCurrent?.() === false) return false;
  const hadIssue = !discrepancy.matches || discrepancy.snapshotCorrupted;

  try {
    if (signal?.aborted || isCurrent?.() === false) return false;

    await accountingRebuildService.rebuildAccountBalances(
      workplaceId,
      accountId,
      undefined,
      hadIssue ? [prepareRunningBalanceRepair(workplaceId, discrepancy, auditTrigger)] : [],
      signal,
      isCurrent,
    );
    if (signal?.aborted || isCurrent?.() === false) return false;
    logger.info(`[IntegrityRepair] Repaired running balances for account ${accountId}`);
    return true;
  } catch (error) {
    logger.error(`[IntegrityRepair] Failed to repair account ${accountId}`, error);
    return false;
  }
}
