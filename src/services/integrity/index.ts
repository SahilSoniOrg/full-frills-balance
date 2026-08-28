import { cleanupDatabase, resetDatabase, resetWorkplace } from './integrityMaintenance';
import { forceRunCheck, runStartupCheck } from './integrityOrchestrator';
import { repairAccountBalance } from './integrityRepair';
import {
  computeBalanceFromTransactions,
  scanForNullAccountTransactions,
  verifyAccountBalance,
  verifyAllAccountBalances,
} from './integrityVerification';
import {
  BalanceVerificationResult,
  IntegrityCheckResult,
  IntegrityProgressCallback,
  IntegrityRepairTrigger,
} from './types';
import { AccountId, WorkplaceId } from '@/src/types/ids';

export * from './types';
export * from './integrityVerification';
export * from './integrityRepair';
export * from './integrityOrchestrator';
export * from './integrityMaintenance';
export * from './accountSnapshotBackfill';

/**
 * IntegrityService
 *
 * Lightweight coordinator providing backward compatibility and unified access
 * to integrity verification, repair, orchestration, and maintenance modules.
 */
export class IntegrityService {
  scanForNullAccountTransactions(workplaceId: WorkplaceId): Promise<void> {
    return scanForNullAccountTransactions(workplaceId);
  }

  computeBalanceFromTransactions(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    cutoffDate?: number,
  ): Promise<number> {
    return computeBalanceFromTransactions(accountId, workplaceId, cutoffDate);
  }

  verifyAccountBalance(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    cutoffDate: number = Date.now(),
  ): Promise<BalanceVerificationResult> {
    return verifyAccountBalance(accountId, workplaceId, cutoffDate);
  }

  verifyAllAccountBalances(workplaceId: WorkplaceId): Promise<BalanceVerificationResult[]> {
    return verifyAllAccountBalances(workplaceId);
  }

  repairAccountBalance(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    verification?: BalanceVerificationResult,
    auditTrigger: IntegrityRepairTrigger = 'repair',
  ): Promise<boolean> {
    return repairAccountBalance(workplaceId, accountId, verification, auditTrigger);
  }

  forceRunCheck(
    workplaceId: WorkplaceId,
    onProgress?: IntegrityProgressCallback,
  ): Promise<IntegrityCheckResult> {
    return forceRunCheck(workplaceId, onProgress);
  }

  runStartupCheck(workplaceId: WorkplaceId, signal?: AbortSignal): Promise<IntegrityCheckResult> {
    return runStartupCheck(workplaceId, signal);
  }

  resetWorkplace(workplaceId: WorkplaceId, keepWorkplaceRecord: boolean = false): Promise<void> {
    return resetWorkplace(workplaceId, keepWorkplaceRecord);
  }

  resetDatabase(): Promise<void> {
    return resetDatabase();
  }

  cleanupDatabase(): Promise<{ deletedCount: number }> {
    return cleanupDatabase();
  }
}

export const integrityService = new IntegrityService();
