/**
 * Integrity Service
 *
 * Handles balance verification and crash recovery.
 * Ensures data integrity by detecting and repairing stale running balances.
 * This service is responsible for checking if the account balances match the transaction history.
 *
 * All database writes are delegated to repositories.
 */

import { AppConfig } from '@/src/constants/app-config';
import { schema } from '@/src/data/database/schema';
import Account from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { smsService } from '@/src/services/sms-service';
import { logger } from '@/src/utils/logger';
import { amountsAreEqual } from '@/src/utils/money';
import { storage } from '@/src/utils/storage';
import { Q } from '@nozbe/watermelondb';

export interface BalanceVerificationResult {
  accountId: string;
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
  async scanForNullAccountTransactions(): Promise<void> {
    const { database } = await import('@/src/data/database/Database');
    const nullAccountTxs = await database.collections
      .get('transactions')
      .query(Q.where('account_id', Q.eq(null)))
      .fetch();

    if (nullAccountTxs.length > 0) {
      throw new Error(
        `CRITICAL INTEGRITY FAILURE: ${nullAccountTxs.length} transactions found with NULL accountId!`,
      );
    }
  }

  /**
   * Computes account balance from scratch.
   *
   * Optimized: Uses a raw SQL aggregate (SUM) if available on the adapter,
   * otherwise falls back to the ORM-based iteration.
   */
  async computeBalanceFromTransactions(
    accountId: string,
    workplaceId: string,
    cutoffDate?: number,
  ): Promise<number> {
    const account = await accountRepository.find(accountId, workplaceId);
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
    const isAssetOrExpense = ['ASSET', 'EXPENSE'].includes(account.accountType);
    const deltaResult = await transactionRawRepository.getAccountSumRaw(
      workplaceId,
      accountId,
      effectiveCutoff,
      isAssetOrExpense,
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
    accountId: string,
    workplaceId: string,
    cutoffDate: number = Date.now(),
  ): Promise<BalanceVerificationResult> {
    const start = Date.now();
    const account = await accountRepository.find(accountId, workplaceId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const precision = await currencyRepository.getPrecision(account.currencyCode);

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
    accountId: string,
    workplaceId: string,
    cutoffDate: number,
    limitTransactionId?: string,
  ): Promise<number> {
    const account = await accountRepository.find(accountId, workplaceId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    // HIGH PERFORMANCE: Use raw SQL aggregate (SUM) from scratch (no snapshot)
    const isAssetOrExpense = ['ASSET', 'EXPENSE'].includes(account.accountType);
    return transactionRawRepository.getAccountSumRaw(
      workplaceId,
      accountId,
      cutoffDate,
      isAssetOrExpense,
      limitTransactionId, // upToTransactionId
      undefined, // afterTransactionId
    );
  }

  /**
   * Verifies all account balances.
   */
  async verifyAllAccountBalances(workplaceId: string): Promise<BalanceVerificationResult[]> {
    const accounts = await accountRepository.findAll(workplaceId);

    const results: BalanceVerificationResult[] = [];

    for (const account of accounts) {
      try {
        const result = await this.verifyAccountBalance(account.id, workplaceId);
        results.push(result);
      } catch (error) {
        logger.error(`[IntegrityService] Failed to verify account ${account.id}`, error);
      }
    }

    return results;
  }

  /**
   * Repairs a single account's running balances.
   */
  async repairAccountBalance(workplaceId: string, accountId: string): Promise<boolean> {
    try {
      await accountingRebuildService.rebuildAccountBalances(workplaceId, accountId);
      logger.info(`[IntegrityService] Repaired running balances for account ${accountId}`);
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
    workplaceId: string,
    onProgress?: (message: string, progress: number) => void,
  ): Promise<IntegrityCheckResult> {
    const totalStart = Date.now();
    logger.info('[IntegrityService] Force-running full balance verification (manual trigger)...');

    await this.scanForNullAccountTransactions();

    const accounts = await accountRepository.findAll(workplaceId);
    const total = accounts.length;
    const results: BalanceVerificationResult[] = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      try {
        const result = await this.verifyAccountBalance(account.id, workplaceId);
        results.push(result);
      } catch (error) {
        logger.error(`[IntegrityService] Failed to verify account ${account.id}`, error);
      }
      const verifyProgress = total > 0 ? ((i + 1) / total) * 0.7 : 0.7;
      onProgress?.(`Checking ${account.name}...`, verifyProgress);
    }

    const discrepancies = results.filter(r => !r.matches || r.snapshotCorrupted);

    let repairsAttempted = 0;
    let repairsSuccessful = 0;

    if (discrepancies.length > 0) {
      const { database } = await import('@/src/data/database/Database');
      const repairedAccountIds: string[] = [];

      for (let i = 0; i < discrepancies.length; i++) {
        const discrepancy = discrepancies[i];
        logger.warn(
          `[IntegrityService] Balance discrepancy for ${discrepancy.accountName}: ` +
            `cached=${discrepancy.cachedBalance}, computed=${discrepancy.computedBalance}` +
            (discrepancy.snapshotCorrupted ? ' [snapshot corrupted]' : ''),
        );
        repairsAttempted++;
        const repairProgress = 0.7 + ((i + 1) / Math.max(discrepancies.length, 1)) * 0.2;
        onProgress?.(`Repairing ${discrepancy.accountName}...`, repairProgress);

        // Perform repair in its own transaction and yield to JS event loop
        // This prevents UI lockup and allows reactive system to breathe
        await database.write(async () => {
          await accountingRebuildService.rebuildAccountBalancesInternal(
            workplaceId,
            discrepancy.accountId,
            undefined,
            true,
          );
          repairsSuccessful++;
          repairedAccountIds.push(discrepancy.accountId);
        });

        // CRITICAL: Yield to allow bridge events (taps) to process
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Perform ONE single unified refresh for all repaired accounts at the very end
      if (repairedAccountIds.length > 0) {
        await database.write(async () => {
          const accountsToNotify = await database.collections
            .get<Account>('accounts')
            .query(Q.where('id', Q.oneOf(repairedAccountIds)))
            .fetch();

          await database.batch(
            accountsToNotify.map(a =>
              a.prepareUpdate((record: Account) => {
                record.updatedAt = new Date();
              }),
            ),
          );
        });
      }
    }

    onProgress?.('Finalizing...', 1);

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
  async runStartupCheck(workplaceId: string): Promise<IntegrityCheckResult> {
    logger.info('[IntegrityService] Starting startup integrity check...');

    await this.scanForNullAccountTransactions();

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
      const success = await this.repairAccountBalance(workplaceId, discrepancy.accountId);
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
   * Clears all data for a specific workplace.
   */
  async resetWorkplace(workplaceId: string): Promise<void> {
    logger.warn(`[IntegrityService] CLEARING DATA FOR WORKPLACE: ${workplaceId}`);
    try {
      const scopedTables = [
        'accounts',
        'journals',
        'transactions',
        'audit_logs',
        'budgets',
        'budget_scopes',
        'account_metadata',
        'planned_payments',
        'journal_metadata',
        'sms_auto_post_rules',
        'sms_inbox_records',
        'balance_snapshots',
      ];

      await databaseRepository.purgeWorkplaceData(workplaceId, scopedTables);

      // Note: we don't clear processed SMS IDs here as they are global in the SMS service's internal state
      // but the records themselves are deleted from the database.

      logger.info(`[IntegrityService] Workplace ${workplaceId} reset successful.`);
    } catch (error) {
      logger.error(`[IntegrityService] Failed to reset workplace ${workplaceId}:`, error);
      throw error;
    }
  }

  /**
   * Factory Reset.
   */
  async resetDatabase(): Promise<void> {
    logger.warn('[IntegrityService] STARTING FACTORY RESET...');
    try {
      await databaseRepository.resetDatabase();
      await smsService.clearProcessedMessages();
      logger.info('[IntegrityService] Database reset successful.');
    } catch (error) {
      logger.error('[IntegrityService] CRITICAL: Factory reset failed:', error);
      throw error;
    }
  }

  /**
   * Data Cleanup.
   */
  async cleanupDatabase(): Promise<{ deletedCount: number }> {
    logger.info('[IntegrityService] Starting database cleanup...');
    try {
      const totalDeleted = await databaseRepository.cleanupDeletedRecords([
        ...AppConfig.strings.audit.tables,
      ]);
      logger.info(`[IntegrityService] Cleanup complete. Removed ${totalDeleted} records.`);
      return { deletedCount: totalDeleted };
    } catch (error) {
      logger.error('[IntegrityService] Cleanup failed:', error);
      throw error;
    }
  }
}

export const integrityService = new IntegrityService();
