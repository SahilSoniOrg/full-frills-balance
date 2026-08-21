import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { analytics } from '@/src/services/analytics';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { amountsAreEqual } from '@/src/utils/money';
import { Q } from '@nozbe/watermelondb';
import { BalanceVerificationResult } from './types';

/**
 * Scans for any transactions with NULL/missing account_id.
 * Fails loudly to prevent old corrupted records from lingering invisibly.
 */
export async function scanForNullAccountTransactions(workplaceId: WorkplaceId): Promise<void> {
  const query = database.collections
    .get<Transaction>('transactions')
    .query(
      Q.or(Q.where('account_id', null), Q.where('account_id', '')),
      Q.where('workplace_id', workplaceId),
    );

  const nullAccountTxs = await query.fetch();

  if (nullAccountTxs.length > 0) {
    const sample = nullAccountTxs[0];
    const errorMsg =
      `CRITICAL INTEGRITY FAILURE: ${nullAccountTxs.length} transactions found with NULL accountId! (Workplace: ${workplaceId})` +
      ` Sample ID: ${sample.id}, Date: ${new Date(sample.transactionDate).toISOString()}`;

    logger.error(`[IntegrityVerification] ${errorMsg}`, undefined, {
      count: nullAccountTxs.length,
      workplaceId,
      sampleId: sample.id,
    });

    analytics.logIntegrityIssue('transactions', 'null_account_id');
    throw new Error(errorMsg);
  }
}

/**
 * Computes account balance from scratch or using latest balance snapshot checkpoint.
 *
 * Optimized: Uses a raw SQL aggregate (SUM) if available on the adapter,
 * otherwise falls back to the ORM-based iteration.
 */
export async function computeBalanceFromTransactions(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  cutoffDate?: number,
): Promise<number> {
  const account = await accountQueryRepository.find(workplaceId, accountId);
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
 * Computes account balance by iterating ALL transactions from the beginning,
 * ignoring any snapshots. Used strictly for snapshot cross-checking.
 */
export async function computeBalanceFromScratch(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  cutoffDate: number,
  limitTransactionId?: TransactionId,
): Promise<number> {
  const account = await accountQueryRepository.find(workplaceId, accountId);
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
 * Verifies a single account's balance.
 *
 * Also cross-checks the most recent snapshot's `absoluteBalance` against
 * a fresh recomputation up to that snapshot's date, to detect corrupted checkpoints.
 */
export async function verifyAccountBalance(
  accountId: AccountId,
  workplaceId: WorkplaceId,
  cutoffDate: number = Date.now(),
): Promise<BalanceVerificationResult> {
  const start = Date.now();
  const account = await accountQueryRepository.find(workplaceId, accountId);
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
  const computedBalance = await computeBalanceFromTransactions(accountId, workplaceId, cutoffDate);
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
    const snapshotRecomputed = await computeBalanceFromScratch(
      accountId,
      workplaceId,
      snapshot.transactionDate,
      snapshot.transactionId,
    );
    snapshotCorrupted = !amountsAreEqual(snapshot.absoluteBalance, snapshotRecomputed, precision);

    if (snapshotCorrupted) {
      logger.warn(
        `[IntegrityVerification] Snapshot corruption detected for account ${accountId}: ` +
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
    `[Trace] IntegrityVerification.verifyAccountBalance (${account.name}): ${Date.now() - start}ms`,
    {
      matches,
      discrepancy,
    },
  );

  return result;
}

/**
 * Verifies all account balances.
 */
export async function verifyAllAccountBalances(
  workplaceId: WorkplaceId,
): Promise<BalanceVerificationResult[]> {
  const accounts = await accountQueryRepository.findAll(workplaceId);
  const results: BalanceVerificationResult[] = [];

  await Promise.all(
    accounts.map(async account => {
      try {
        const result = await verifyAccountBalance(account.id, workplaceId);
        results.push(result);
      } catch (error) {
        logger.error(`[IntegrityVerification] Failed to verify account ${account.id}`, error);
      }
    }),
  );

  return results;
}
