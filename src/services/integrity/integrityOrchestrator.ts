import { schema } from '@/src/data/database/schema';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import { analytics } from '@/src/services/analytics';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';
import { repairAccountBalance } from './integrityRepair';
import { backfillAccountSnapshotsIfNeeded } from './accountSnapshotBackfill';
import { scanForNullAccountTransactions, verifyAllAccountBalances } from './integrityVerification';
import {
  BalanceVerificationResult,
  IntegrityCheckResult,
  IntegrityProgressCallback,
  IntegrityRepairTrigger,
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

async function repairDiscrepancies(
  workplaceId: WorkplaceId,
  discrepancies: BalanceVerificationResult[],
  trigger: IntegrityRepairTrigger,
  options: {
    signal?: AbortSignal;
    onProgress?: IntegrityProgressCallback;
    manualBatchRefresh?: boolean;
  },
): Promise<{ repairsAttempted: number; repairsSuccessful: number }> {
  let repairsAttempted = 0;
  let repairsSuccessful = 0;
  const repairedAccountIds: AccountId[] = [];

  for (let i = 0; i < discrepancies.length; i++) {
    const discrepancy = discrepancies[i];
    if (options.signal?.aborted) {
      logger.info('[IntegrityOrchestrator] Startup check aborted before completing all repairs.');
      break;
    }
    logger.warn(
      `[IntegrityOrchestrator] Balance discrepancy for ${discrepancy.accountName}: ` +
        `cached=${discrepancy.cachedBalance}, computed=${discrepancy.computedBalance}` +
        (discrepancy.snapshotCorrupted ? ' [snapshot corrupted]' : ''),
    );

    repairsAttempted++;
    if (trigger === 'startup') {
      analytics.track('integrity_issue', {
        table: 'accounts',
        issueType: `discrepancy_${discrepancy.snapshotCorrupted ? 'corrupted_snapshot' : 'running_balance'}`,
      });
    } else {
      const repairProgress = 0.7 + (i / discrepancies.length) * 0.25;
      options.onProgress?.(
        `Repairing balance for ${discrepancy.accountName} (${i + 1}/${discrepancies.length})`,
        repairProgress,
      );
    }

    const repairSucceeded = await repairAccountBalance(
      workplaceId,
      discrepancy.accountId,
      discrepancy,
      trigger,
      options.signal,
    );

    if (repairSucceeded) {
      repairsSuccessful++;
      if (options.manualBatchRefresh) {
        repairedAccountIds.push(discrepancy.accountId);
      }
    }

    if (trigger === 'manual') {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  if (options.manualBatchRefresh && repairedAccountIds.length > 0) {
    options.onProgress?.('Updating database snapshots...', 0.96);
    await accountWriteRepository.refreshAccounts(workplaceId, repairedAccountIds);
  }

  return { repairsAttempted, repairsSuccessful };
}

/**
 * Forces a full balance verification and repair, regardless of stored schema version.
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

  await backfillAccountSnapshotsIfNeeded(workplaceId, undefined, (completed, total) => {
    const backfillProgress = total > 0 ? 0.02 + (completed / total) * 0.18 : 0.02;
    onProgress?.(`Rebuilding account checkpoints: ${completed}/${total}`, backfillProgress);
  });

  const results = await verifyAllAccountBalances(workplaceId, {
    onAccountChecked: (account, checkedCount, total) => {
      const verifyProgress = total > 0 ? (checkedCount / total) * 0.7 : 0.05;
      onProgress?.(
        `Checking account balances: ${account.name} (${checkedCount}/${total})`,
        verifyProgress,
      );
    },
  });

  onProgress?.('Verification phase complete. Analyzing results...', 0.7);
  const discrepancies = results.filter(r => !r.matches || r.snapshotCorrupted);

  let repairsAttempted = 0;
  let repairsSuccessful = 0;

  if (discrepancies.length > 0) {
    const repairTotals = await repairDiscrepancies(workplaceId, discrepancies, 'manual', {
      onProgress,
      manualBatchRefresh: true,
    });
    repairsAttempted = repairTotals.repairsAttempted;
    repairsSuccessful = repairTotals.repairsSuccessful;
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
 * The full balance verification is expensive (O(accounts × transactions)).
 * We only run it when the stored schema version differs from the current schema.
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

  await backfillAccountSnapshotsIfNeeded(workplaceId, signal, (completed, total) => {
    logger.info(`[IntegrityOrchestrator] Rebuilt account checkpoints (${completed}/${total})`);
  });

  const accountsExist = await accountQueryRepository.exists(workplaceId);
  if (!accountsExist) {
    logger.info(
      '[IntegrityOrchestrator] No accounts found. Skipping default seeding (onboarding handles data creation).',
    );
  }

  const shouldRun = shouldRunIntegrityCheck(workplaceId);
  if (!shouldRun) {
    logger.info('[IntegrityOrchestrator] Skipping balance verification (schema unchanged).');
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

  const { repairsAttempted, repairsSuccessful } = await repairDiscrepancies(
    workplaceId,
    discrepancies,
    'startup',
    { signal },
  );

  const repairsComplete =
    repairsAttempted === discrepancies.length && repairsSuccessful === repairsAttempted;
  if (!signal?.aborted && repairsComplete) {
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
