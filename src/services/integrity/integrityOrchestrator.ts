import { database } from '@/src/data/database/Database';
import { schema } from '@/src/data/database/schema';
import Account from '@/src/data/models/Account';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { analytics } from '@/src/services/analytics-service';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';
import { Q } from '@nozbe/watermelondb';
import { prepareRunningBalanceRepair, repairAccountBalance } from './integrityRepair';
import {
  scanForNullAccountTransactions,
  verifyAccountBalance,
  verifyAllAccountBalances,
} from './integrityVerification';
import {
  BalanceVerificationResult,
  IntegrityCheckResult,
  IntegrityProgressCallback,
} from './types';

const SCHEMA_VERSION_KEY = '@integrity_schema_version';

/**
 * Returns true if the full balance-verification scan should run for this workplace.
 * Runs when the stored schema version differs from the current one (i.e. after a migration).
 */
export function shouldRunIntegrityCheck(workplaceId: WorkplaceId): boolean {
  const key = `${SCHEMA_VERSION_KEY}_${workplaceId}`;
  const storedVersion = storage.getString(key);
  const currentVersion = String(schema.version);

  if (storedVersion !== currentVersion) {
    logger.info(
      `[IntegrityOrchestrator] Schema changed for workplace ${workplaceId} (${storedVersion} → ${currentVersion}) — running full integrity check.`,
    );
    return true;
  }
  return false;
}

export function markIntegrityCheckComplete(workplaceId: WorkplaceId): void {
  const key = `${SCHEMA_VERSION_KEY}_${workplaceId}`;
  storage.set(key, String(schema.version));
}

/**
 * Forces a full balance verification and repair, regardless of crash flag or schema version.
 * Use this for **manual** invocations (e.g. the Settings "Fix Integrity Issues" button).
 * Unlike runStartupCheck(), this always scans every account.
 */
export async function forceRunCheck(
  workplaceId: WorkplaceId,
  onProgress?: IntegrityProgressCallback,
): Promise<IntegrityCheckResult> {
  const totalStart = Date.now();
  logger.info(
    '[IntegrityOrchestrator] Force-running full balance verification (manual trigger)...',
  );

  onProgress?.('Scanning for orphaned transactions...', 0.02);
  await scanForNullAccountTransactions(workplaceId);

  const accounts = await accountQueryRepository.findAll(workplaceId);
  const total = accounts.length;
  const results: BalanceVerificationResult[] = [];

  let checkedCount = 0;
  await Promise.all(
    accounts.map(async account => {
      try {
        const result = await verifyAccountBalance(account.id, workplaceId);
        results.push(result);
      } catch (error) {
        logger.error(`[IntegrityOrchestrator] Failed to verify account ${account.id}`, error);
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
        `[IntegrityOrchestrator] Balance discrepancy for ${discrepancy.accountName}: ` +
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
          [prepareRunningBalanceRepair(workplaceId, discrepancy, 'manual')],
        );
        repairSucceeded = true;
        repairedAccountIds.push(discrepancy.accountId);
      });

      if (repairSucceeded) {
        repairsSuccessful++;
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

      await persistBatch(
        accountsToNotify.map(a =>
          a.prepareUpdate((record: Account) => {
            record.updatedAt = new Date();
          }),
        ),
      );
    }
  } else {
    onProgress?.('No discrepancies found. All balances correct.', 0.9);
    await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for user to see the success message
  }

  onProgress?.('Verification complete', 1);

  const totalDuration = Date.now() - totalStart;
  logger.info(`[Trace] IntegrityOrchestrator.forceRunCheck: ${totalDuration}ms`, {
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
export async function runStartupCheck(
  workplaceId: WorkplaceId,
  signal?: AbortSignal,
): Promise<IntegrityCheckResult> {
  logger.info('[IntegrityOrchestrator] Starting startup integrity check...');

  if (signal?.aborted) {
    logger.info('[IntegrityOrchestrator] Startup integrity check aborted before start.');
    return {
      totalAccounts: 0,
      accountsChecked: 0,
      discrepanciesFound: 0,
      repairsAttempted: 0,
      repairsSuccessful: 0,
      results: [],
    };
  }

  await scanForNullAccountTransactions(workplaceId);
  if (signal?.aborted) {
    return {
      totalAccounts: 0,
      accountsChecked: 0,
      discrepanciesFound: 0,
      repairsAttempted: 0,
      repairsSuccessful: 0,
      results: [],
    };
  }

  const accountsExist = await accountQueryRepository.exists(workplaceId);
  if (!accountsExist) {
    logger.info(
      '[IntegrityOrchestrator] No accounts found. Skipping default seeding (onboarding handles data creation).',
    );
  }

  const shouldRun = shouldRunIntegrityCheck(workplaceId);
  if (!shouldRun) {
    logger.info(
      '[IntegrityOrchestrator] Skipping balance verification (no crash flag, schema unchanged).',
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

  logger.info('[IntegrityOrchestrator] Running full balance verification...');
  const results = await verifyAllAccountBalances(workplaceId);
  if (signal?.aborted) {
    logger.info('[IntegrityOrchestrator] Startup check aborted after verification.');
    return {
      totalAccounts: results.length,
      accountsChecked: results.length,
      discrepanciesFound: 0,
      repairsAttempted: 0,
      repairsSuccessful: 0,
      results: [],
    };
  }

  const discrepancies = results.filter(r => !r.matches || r.snapshotCorrupted);

  let repairsAttempted = 0;
  let repairsSuccessful = 0;

  for (const discrepancy of discrepancies) {
    if (signal?.aborted) {
      logger.info('[IntegrityOrchestrator] Startup check aborted before completing all repairs.');
      break;
    }
    logger.warn(
      `[IntegrityOrchestrator] Balance discrepancy for ${discrepancy.accountName}: ` +
        `cached=${discrepancy.cachedBalance}, computed=${discrepancy.computedBalance}` +
        (discrepancy.snapshotCorrupted ? ' [snapshot corrupted]' : ''),
    );

    repairsAttempted++;
    analytics.logIntegrityIssue(
      'accounts',
      `discrepancy_${discrepancy.snapshotCorrupted ? 'corrupted_snapshot' : 'running_balance'}`,
    );
    const success = await repairAccountBalance(
      workplaceId,
      discrepancy.accountId,
      discrepancy,
      'startup',
    );
    if (success) {
      repairsSuccessful++;
    }
  }

  if (!signal?.aborted) {
    markIntegrityCheckComplete(workplaceId);
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
