/**
 * Integrity Service
 *
 * Handles balance verification and crash recovery.
 * Ensures data integrity by detecting and repairing stale running balances.
 * This service is responsible for checking if the account balances match the transaction history.
 *
 * All database writes are delegated to repositories.
 */

import { schema } from '@/src/data/database/schema';
import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { AuditAction } from '@/src/data/models/AuditLog';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { analytics } from '@/src/services/analytics-service';
import { auditService } from '@/src/services/audit-service';
import {
  cleanupDatabase as runDatabaseCleanup,
  resetDatabase as runFactoryReset,
  resetWorkplace as runWorkplaceReset,
} from '@/src/services/integrity/integrityMaintenance';

import { AccountId, TransactionId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { amountsAreEqual } from '@/src/utils/money';
import { storage } from '@/src/utils/storage';
import { Q } from '@nozbe/watermelondb';

export interface BalanceVerificationResult {
  accountId: AccountId;
  accountName: string;
  cachedBalance: number;
  computedBalance: number;
  matches: boolean;
  discrepancy: number;
  /** True when a snapshot's stored absoluteBalance didn't match a recomputation at that point */
  snapshotCorrupted?: boolean;
}

export interface IntegrityCheckResult {
  totalAccounts: number;
  accountsChecked: number;
  discrepanciesFound: number;
  repairsAttempted: number;
  repairsSuccessful: number;
  results: BalanceVerificationResult[];
}

// Default constants removed as they are handled by onboardingService

// Default accounts are handled by onboardingService

export class IntegrityService {
  /**
   * Scans for any transactions with NULL/missing account_id.
   * Fails loudly to prevent old corrupted records from lingering invisibly.
   */
  async scanForNullAccountTransactions(workplaceId?: WorkplaceId): Promise<void> {
    const query = database.collections
      .get<Transaction>('transactions')
      .query(
        Q.where('account_id', Q.eq(null)),
        ...(workplaceId ? [Q.where('workplace_id', workplaceId)] : []),
      );

    const nullAccountTxs = await query.fetch();

    if (nullAccountTxs.length > 0) {
      const sample = nullAccountTxs[0];
      const errorMsg =
        `CRITICAL INTEGRITY FAILURE: ${nullAccountTxs.length} transactions found with NULL accountId!` +
        (workplaceId ? ` (Workplace: ${workplaceId})` : '') +
        ` Sample ID: ${sample.id}, Date: ${new Date(sample.transactionDate).toISOString()}`;

      logger.error(`[IntegrityService] ${errorMsg}`, undefined, {
        count: nullAccountTxs.length,
        workplaceId,
        sampleId: sample.id,
      });

      analytics.logIntegrityIssue('transactions', 'null_account_id');
      throw new Error(errorMsg);
    }
  }

  /**
   * Computes account balance from scratch.
   *
   * Optimized: Uses a raw SQL aggregate (SUM) if available on the adapter,
   * otherwise falls back to the ORM-based iteration.
   */
  async computeBalanceFromTransactions(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    cutoffDate?: number,
  ): Promise<number> {
    const account = await accountRepository.find(workplaceId, accountId as AccountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    const effectiveCutoff = cutoffDate ?? Date.now();

    // Try to find the latest snapshot as a checkpoint
    const snapshot = await balanceSnapshotRepository.findLatestForAccount(
      workplaceId,
      accountId,
      effectiveCutoff,
    );

    const startBalance = snapshot?.absoluteBalance || 0;

    // HIGH PERFORMANCE: Use raw SQL aggregate (SUM)
    // Optimization: Bypasses ORM bridge deserialization (O(1) Memory, O(N) DB Scan)
    const deltaResult = await transactionRawRepository.getAccountSumRaw(
      workplaceId,
      accountId,
      effectiveCutoff,
      account.accountType,
      undefined, // upToTransactionId
      snapshot?.transactionId, // afterTransactionId
    );

    return startBalance + deltaResult;
  }

  /**
   * Verifies a single account's balance.
   *
   * Also cross-checks the most recent snapshot's `absoluteBalance` against
   * a fresh recomputation up to that snapshot's date, to detect corrupted checkpoints.
   */
  async verifyAccountBalance(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    cutoffDate: number = Date.now(),
  ): Promise<BalanceVerificationResult> {
    const start = Date.now();
    const account = await accountRepository.find(workplaceId, accountId as AccountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const precision = await currencyReadService.getPrecision(account.currencyCode);

    // 1. Get the "Cached" balance (the actual running_balance column of the latest transaction)
    const latestBalances = await transactionRawRepository.getLatestBalancesRaw(
      workplaceId,
      [accountId],
      cutoffDate,
    );
    const cachedBalance = latestBalances.get(accountId) || 0;

    // 2. Compute the "Real" balance using the snapshot-optimized path
    const computedBalance = await this.computeBalanceFromTransactions(
      accountId,
      workplaceId,
      cutoffDate,
    );
    const matches = amountsAreEqual(cachedBalance, computedBalance, precision);
    const discrepancy = matches ? 0 : Math.abs(cachedBalance - computedBalance);

    // 3. Check if the snapshot itself is corrupt (cross-check)
    let snapshotCorrupted: boolean | undefined = undefined;
    const snapshot = await balanceSnapshotRepository.findLatestForAccount(
      workplaceId,
      accountId,
      cutoffDate,
    );
    if (snapshot && snapshot.transactionId) {
      // Recompute from scratch (no snapshot) up to the snapshot's exact transaction
      const snapshotRecomputed = await this.computeBalanceFromScratch(
        accountId,
        workplaceId,
        snapshot.transactionDate,
        snapshot.transactionId,
      );
      snapshotCorrupted = !amountsAreEqual(snapshot.absoluteBalance, snapshotRecomputed, precision);

      if (snapshotCorrupted) {
        logger.warn(
          `[IntegrityService] Snapshot corruption detected for account ${accountId}: ` +
            `snapshot.absoluteBalance=${snapshot.absoluteBalance}, recomputed=${snapshotRecomputed}`,
        );
      }
    }

    const result: BalanceVerificationResult = {
      accountId,
      accountName: account.name,
      cachedBalance,
      computedBalance,
      matches,
      discrepancy,
      snapshotCorrupted,
    };

    logger.info(
      `[Trace] IntegrityService.verifyAccountBalance (${account.name}): ${Date.now() - start}ms`,
      {
        matches,
        discrepancy,
      },
    );

    return result;
  }

  /**
   * Computes account balance by iterating ALL transactions from the beginning,
   * ignoring any snapshots. Used strictly for snapshot cross-checking.
   */
  private async computeBalanceFromScratch(
    accountId: AccountId,
    workplaceId: WorkplaceId,
    cutoffDate: number,
    limitTransactionId?: TransactionId,
  ): Promise<number> {
    const account = await accountRepository.find(workplaceId, accountId as AccountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    // HIGH PERFORMANCE: Use raw SQL aggregate (SUM) from scratch (no snapshot)
    return transactionRawRepository.getAccountSumRaw(
      workplaceId,
      accountId,
      cutoffDate,
      account.accountType,
      limitTransactionId, // upToTransactionId
      undefined, // afterTransactionId
    );
  }

  /**
   * Verifies all account balances.
   */
  async verifyAllAccountBalances(workplaceId: WorkplaceId): Promise<BalanceVerificationResult[]> {
    const accounts = await accountRepository.findAll(workplaceId);

    const results: BalanceVerificationResult[] = [];

    await Promise.all(
      accounts.map(async account => {
        try {
          const result = await this.verifyAccountBalance(account.id, workplaceId);
          results.push(result);
        } catch (error) {
          logger.error(`[IntegrityService] Failed to verify account ${account.id}`, error);
        }
      }),
    );

    return results;
  }

  /**
   * Records a successful running-balance integrity repair in the audit trail.
   */
  private async logRunningBalanceRepair(
    workplaceId: WorkplaceId,
    discrepancy: BalanceVerificationResult,
    trigger: 'startup' | 'manual' | 'repair',
  ): Promise<void> {
    await auditService.log(
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
  async repairAccountBalance(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    verification?: BalanceVerificationResult,
    auditTrigger: 'startup' | 'manual' | 'repair' = 'repair',
  ): Promise<boolean> {
    const discrepancy = verification ?? (await this.verifyAccountBalance(accountId, workplaceId));
    const hadIssue = !discrepancy.matches || discrepancy.snapshotCorrupted;

    try {
      await accountingRebuildService.rebuildAccountBalances(workplaceId, accountId);
      logger.info(`[IntegrityService] Repaired running balances for account ${accountId}`);
      if (hadIssue) {
        await this.logRunningBalanceRepair(workplaceId, discrepancy, auditTrigger);
      }
      return true;
    } catch (error) {
      logger.error(`[IntegrityService] Failed to repair account ${accountId}`, error);
      return false;
    }
  }

  // ─── Schema-version guard ────────────────────────────────────────────────────
  private static readonly SCHEMA_VERSION_KEY = '@integrity_schema_version';

  /**
   * Returns true if the full balance-verification scan should run.
   * Runs when the stored schema version differs from the current one (i.e. after a migration).
   */
  private shouldRunIntegrityCheck(): boolean {
    const storedVersion = storage.getString(IntegrityService.SCHEMA_VERSION_KEY);
    const currentVersion = String(schema.version);

    if (storedVersion !== currentVersion) {
      logger.info(
        `[IntegrityService] Schema changed (${storedVersion} → ${currentVersion}) — running full integrity check.`,
      );
      storage.set(IntegrityService.SCHEMA_VERSION_KEY, currentVersion);
      return true;
    }
    return false;
  }

  /**
   * Forces a full balance verification and repair, regardless of crash flag or schema version.
   * Use this for **manual** invocations (e.g. the Settings "Fix Integrity Issues" button).
   * Unlike runStartupCheck(), this always scans every account.
   */
  async forceRunCheck(
    workplaceId: WorkplaceId,
    onProgress?: (message: string, progress: number) => void,
  ): Promise<IntegrityCheckResult> {
    const totalStart = Date.now();
    logger.info('[IntegrityService] Force-running full balance verification (manual trigger)...');

    onProgress?.('Scanning for orphaned transactions...', 0.02);
    await this.scanForNullAccountTransactions(workplaceId);

    const accounts = await accountRepository.findAll(workplaceId);
    const total = accounts.length;
    const results: BalanceVerificationResult[] = [];

    let checkedCount = 0;
    await Promise.all(
      accounts.map(async account => {
        try {
          const result = await this.verifyAccountBalance(account.id, workplaceId);
          results.push(result);
        } catch (error) {
          logger.error(`[IntegrityService] Failed to verify account ${account.id}`, error);
        } finally {
          checkedCount++;
          const verifyProgress = total > 0 ? (checkedCount / total) * 0.7 : 0.05;
          onProgress?.(
            `Checking account balances: ${account.name} (${checkedCount}/${total})`,
            verifyProgress,
          );
        }
      }),
    );

    onProgress?.('Verification phase complete. Analyzing results...', 0.7);
    const discrepancies = results.filter(r => !r.matches || r.snapshotCorrupted);

    let repairsAttempted = 0;
    let repairsSuccessful = 0;

    if (discrepancies.length > 0) {
      const repairedAccountIds: string[] = [];

      for (let i = 0; i < discrepancies.length; i++) {
        const discrepancy = discrepancies[i];
        logger.warn(
          `[IntegrityService] Balance discrepancy for ${discrepancy.accountName}: ` +
            `cached=${discrepancy.cachedBalance}, computed=${discrepancy.computedBalance}` +
            (discrepancy.snapshotCorrupted ? ' [snapshot corrupted]' : ''),
        );
        repairsAttempted++;

        // Repair phase uses 0.7 to 0.95 range
        const repairProgress = 0.7 + (i / discrepancies.length) * 0.25;
        onProgress?.(
          `Repairing balance for ${discrepancy.accountName} (${i + 1}/${discrepancies.length})`,
          repairProgress,
        );

        // Perform repair in its own transaction and yield to JS event loop
        // This prevents UI lockup and allows reactive system to breathe
        let repairSucceeded = false;
        await database.write(async () => {
          await accountingRebuildService.rebuildAccountBalancesInternal(
            workplaceId,
            discrepancy.accountId,
            undefined,
            true,
          );
          repairSucceeded = true;
          repairedAccountIds.push(discrepancy.accountId);
        });

        if (repairSucceeded) {
          repairsSuccessful++;
          await this.logRunningBalanceRepair(workplaceId, discrepancy, 'manual');
        }

        // CRITICAL: Yield to allow bridge events (taps) to process
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Perform ONE single unified refresh for all repaired accounts at the very end
      if (repairedAccountIds.length > 0) {
        onProgress?.('Updating database snapshots...', 0.96);
        const accountsToNotify = await database.collections
          .get<Account>('accounts')
          .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf(repairedAccountIds)))
          .fetch();

        await database.write(async () => {
          const updateOps = accountsToNotify.map(a =>
            a.prepareUpdate((record: Account) => {
              record.updatedAt = new Date();
            }),
          );
          await database.batch(updateOps);
        });
      }
    } else {
      onProgress?.('No discrepancies found. All balances correct.', 0.9);
      await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for user to see the success message
    }

    onProgress?.('Verification complete', 1);

    const totalDuration = Date.now() - totalStart;
    logger.info(`[Trace] IntegrityService.forceRunCheck: ${totalDuration}ms`, {
      totalAccounts: results.length,
      discrepancies: discrepancies.length,
    });

    return {
      totalAccounts: results.length,
      accountsChecked: results.length,
      discrepanciesFound: discrepancies.length,
      repairsAttempted,
      repairsSuccessful,
      results,
    };
  }

  /**
   * Runs startup integrity check and seeds defaults if database is empty.
   *
   * H-6 fix: The full balance verification is expensive (O(accounts × transactions)).
   * We only run it when truly necessary:
   *  - On first launch (no stored schema version → could be corrupted fresh install).
   *  - When a crash flag was written by the previous session.
   * Normal warm starts skip it entirely.
   */
  async runStartupCheck(workplaceId: WorkplaceId): Promise<IntegrityCheckResult> {
    logger.info('[IntegrityService] Starting startup integrity check...');

    await this.scanForNullAccountTransactions(workplaceId);

    const accountsExist = await accountRepository.exists(workplaceId);
    if (!accountsExist) {
      logger.info(
        '[IntegrityService] No accounts found. Skipping default seeding (onboarding handles data creation).',
      );
    }

    const shouldRun = this.shouldRunIntegrityCheck();
    if (!shouldRun) {
      logger.info(
        '[IntegrityService] Skipping balance verification (no crash flag, schema unchanged).',
      );
      return {
        totalAccounts: 0,
        accountsChecked: 0,
        discrepanciesFound: 0,
        repairsAttempted: 0,
        repairsSuccessful: 0,
        results: [],
      };
    }

    logger.info('[IntegrityService] Running full balance verification...');
    const results = await this.verifyAllAccountBalances(workplaceId);
    const discrepancies = results.filter(r => !r.matches || r.snapshotCorrupted);

    let repairsAttempted = 0;
    let repairsSuccessful = 0;

    for (const discrepancy of discrepancies) {
      logger.warn(
        `[IntegrityService] Balance discrepancy for ${discrepancy.accountName}: ` +
          `cached=${discrepancy.cachedBalance}, computed=${discrepancy.computedBalance}` +
          (discrepancy.snapshotCorrupted ? ' [snapshot corrupted]' : ''),
      );

      repairsAttempted++;
      analytics.logIntegrityIssue(
        'accounts',
        `discrepancy_${discrepancy.snapshotCorrupted ? 'corrupted_snapshot' : 'running_balance'}`,
      );
      const success = await this.repairAccountBalance(
        workplaceId,
        discrepancy.accountId,
        discrepancy,
        'startup',
      );
      if (success) {
        repairsSuccessful++;
      }
    }

    const summary: IntegrityCheckResult = {
      totalAccounts: results.length,
      accountsChecked: results.length,
      discrepanciesFound: discrepancies.length,
      repairsAttempted,
      repairsSuccessful,
      results,
    };

    return summary;
  }

  /**
   * Clears all data for a specific workplace and optionally deletes the workplace itself.
   */
  async resetWorkplace(
    workplaceId: WorkplaceId,
    keepWorkplaceRecord: boolean = false,
  ): Promise<void> {
    return runWorkplaceReset(workplaceId, keepWorkplaceRecord);
  }

  /**
   * Factory Reset.
   */
  async resetDatabase(): Promise<void> {
    return runFactoryReset();
  }

  /**
   * Data Cleanup.
   */
  async cleanupDatabase(): Promise<{ deletedCount: number }> {
    return runDatabaseCleanup();
  }
}

export const integrityService = new IntegrityService();
