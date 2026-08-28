import { accountQueryRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { AppConfig } from '@/src/constants/app-config';
import { WorkplaceId } from '@/src/types/ids';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';

const ACCOUNT_SNAPSHOT_BACKFILL_KEY = '@integrity_account_snapshot_backfill_version';
const ACCOUNT_SNAPSHOT_BACKFILL_VERSION = '2';

export async function backfillAccountSnapshotsIfNeeded(
  workplaceId: WorkplaceId,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<boolean> {
  const key = `${ACCOUNT_SNAPSHOT_BACKFILL_KEY}_${workplaceId}`;
  const storedVersion = storage.getString(key);
  logger.info('[DEBUG-SNAPSHOT-BACKFILL] Entered', {
    workplaceId,
    storedVersion: storedVersion ?? null,
    expectedVersion: ACCOUNT_SNAPSHOT_BACKFILL_VERSION,
  });
  if (storedVersion === ACCOUNT_SNAPSHOT_BACKFILL_VERSION) {
    logger.info('[DEBUG-SNAPSHOT-BACKFILL] Skipped: already completed', { workplaceId });
    return false;
  }

  const accounts = await accountQueryRepository.findAll(workplaceId);
  logger.info('[DEBUG-SNAPSHOT-BACKFILL] Accounts loaded', {
    workplaceId,
    accountCount: accounts.length,
  });
  if (accounts.length === 0) {
    logger.info('[DEBUG-SNAPSHOT-BACKFILL] Skipped: no accounts', { workplaceId });
    return false;
  }

  let completed = 0;
  await runTasksWithBoundedConcurrency(
    accounts,
    AppConfig.performance.import.postImportAccountRebuildConcurrency,
    async account => {
      if (signal?.aborted) return;
      const beforeSnapshot = await balanceSnapshotRepository.findLatestForAccount(
        workplaceId,
        account.id,
      );
      logger.info('[DEBUG-SNAPSHOT-BACKFILL] Rebuilding account', {
        workplaceId,
        accountId: account.id,
        accountName: account.name,
        snapshotBefore: beforeSnapshot
          ? {
              transactionId: beforeSnapshot.transactionId,
              transactionCount: beforeSnapshot.transactionCount,
              transactionDate: beforeSnapshot.transactionDate,
            }
          : null,
      });
      await accountingRebuildService.rebuildAccountBalances(
        workplaceId,
        account.id,
        undefined,
        [],
        signal,
      );
      completed += 1;
      const afterSnapshot = await balanceSnapshotRepository.findLatestForAccount(
        workplaceId,
        account.id,
      );
      logger.info('[DEBUG-SNAPSHOT-BACKFILL] Rebuilt account', {
        workplaceId,
        accountId: account.id,
        completed,
        total: accounts.length,
        snapshotAfter: afterSnapshot
          ? {
              transactionId: afterSnapshot.transactionId,
              transactionCount: afterSnapshot.transactionCount,
              transactionDate: afterSnapshot.transactionDate,
            }
          : null,
      });
      onProgress?.(completed, accounts.length);
    },
  );

  if (!signal?.aborted) {
    storage.set(key, ACCOUNT_SNAPSHOT_BACKFILL_VERSION);
    logger.info('[DEBUG-SNAPSHOT-BACKFILL] Completed and marked', {
      workplaceId,
      accountCount: accounts.length,
    });
    return true;
  }

  logger.info('[DEBUG-SNAPSHOT-BACKFILL] Aborted before marking complete', {
    workplaceId,
    completed,
    total: accounts.length,
  });
  return false;
}
