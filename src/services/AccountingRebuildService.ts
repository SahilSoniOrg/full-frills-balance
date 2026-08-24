import { AppConfig } from '@/src/constants';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { currencyReadService } from '@/src/services/currency-read-service';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { RebuildTransaction } from '@/src/data/repositories/TransactionTypes';
import { foldBalances } from '@/src/utils/accounting/BalanceEffects';
import { logger } from '@/src/utils/logger';
import { amountsAreEqual } from '@/src/utils/money';
import { Model } from '@nozbe/watermelondb';
import { TransactionType } from '@/src/types/enums';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/ids';

import { storage } from '@/src/utils/storage';

const CHECKPOINT_INTERVAL = AppConfig.performance.rebuild.checkpointInterval;
const REBUILD_LOCK_PREFIX = 'rebuild_lock_';

export class AccountingRebuildService {
  /**
   * Rebuilds running balances for an account using a segmented snapshot strategy.
   * @param accountId The account ID to rebuild balances for
   * @param fromDate Optional timestamp of the change. Will find the latest checkpoint before this date.
   */
  async rebuildAccountBalances(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    fromDate?: number,
    extraOps: Model[] = [],
  ): Promise<void> {
    const lockKey = REBUILD_LOCK_PREFIX + accountId;

    // Atomic-ish check and set for RN/single-threaded JS
    // Since storage calls are synchronous, this prevents race conditions in the same event loop.
    if (storage.getString(lockKey)) {
      logger.warn(
        `[AccountingRebuildService] Rebuild already in progress for ${accountId}, skipping.`,
      );
      if (extraOps.length > 0) {
        throw new Error(`Rebuild already in progress for ${accountId}; cannot attach extraOps`);
      }
      return;
    }

    storage.set(lockKey, String(Date.now()));
    try {
      await this.rebuildAccountBalancesInternal(workplaceId, accountId, fromDate, false, extraOps);
    } finally {
      storage.remove(lockKey);
    }
  }

  /**
   * Internal version that DOES NOT perform its own database.write.
   * Use this when calling from an existing transaction (e.g. IntegrityService batch).
   */
  async rebuildAccountBalancesInternal(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    fromDate?: number,
    silent: boolean = false,
    extraOps: Model[] = [],
  ): Promise<void> {
    logger.debug(
      `[AccountingRebuildService] Rebuilding balances for account ${accountId} from ${fromDate || 'start'} (silent=${silent})`,
    );

    const account = await accountQueryRepository.findWithDeleted(workplaceId, accountId);
    if (!account) {
      logger.warn(
        `[AccountingRebuildService] Account ${accountId} not found during running balance rebuild, skipping.`,
      );
      return;
    }

    const precision = await currencyReadService.getPrecision(account.currencyCode);

    // 1. Find the latest checkpoint strictly before the change
    const snapshot = fromDate
      ? await balanceSnapshotRepository.findLatestForAccount(workplaceId, accountId, fromDate - 1)
      : null;

    let runningBalance = snapshot?.absoluteBalance || 0;
    let runningCount = snapshot?.transactionCount || 0;
    let startDate = snapshot?.transactionDate || 0;

    // 2. Fetch minimal raw transaction data for calculation
    // This is significantly faster than fetching full models (O(1) memory per row vs O(Model))
    let rawTransactions: RebuildTransaction[] = await transactionRawRepository.getRebuildDataRaw(
      workplaceId,
      accountId,
      startDate,
    );

    // Precise Anchor: If we have a snapshot, find its transaction and skip everything up to it.
    if (snapshot) {
      const snapshotIdx = rawTransactions.findIndex(tx => tx.id === snapshot.transactionId);
      if (snapshotIdx !== -1) {
        rawTransactions = rawTransactions.slice(snapshotIdx + 1);
      } else {
        // Fallback: exclude snapshot date purely by timestamp if ID not found
        rawTransactions = rawTransactions.filter(tx => tx.transactionDate > startDate);
      }
    }

    const idsNeedingUpdate = new Map<string, number>(); // id -> newBalance
    const snapshotsToCreate: {
      transactionId: TransactionId;
      transactionDate: number;
      absoluteBalance: number;
      transactionCount: number;
    }[] = [];

    const { balances } = foldBalances(
      runningBalance,
      rawTransactions.map(tx => ({
        amount: tx.amount,
        accountType: account.accountType,
        transactionType: tx.transactionType as TransactionType,
      })),
      precision,
    );

    let currentCount = runningCount;

    // 3. Calculate new balances and identify new snapshots using plain objects
    for (let i = 0; i < rawTransactions.length; i++) {
      const tx = rawTransactions[i];
      currentCount++;
      const newBalance = balances[i];

      const isSnapshotPoint = currentCount % CHECKPOINT_INTERVAL === 0;

      // Only mark for update if the DB value differs from calculated
      if (!amountsAreEqual(tx.runningBalance || 0, newBalance, precision) || isSnapshotPoint) {
        idsNeedingUpdate.set(tx.id, newBalance);
      }

      if (isSnapshotPoint) {
        snapshotsToCreate.push({
          transactionId: tx.id,
          transactionDate: tx.transactionDate,
          absoluteBalance: newBalance,
          transactionCount: currentCount,
        });
      }
    }

    // 4. Fetch all data needed for rebuilding asynchronously first
    if (idsNeedingUpdate.size > 0 || snapshotsToCreate.length > 0 || extraOps.length > 0) {
      const idsArray = Array.from(idsNeedingUpdate.keys());
      const BATCH_SIZE = AppConfig.performance.rebuild.batchSize;
      const allModelsToUpdate: Transaction[] = [];

      for (let i = 0; i < idsArray.length; i += BATCH_SIZE) {
        const chunkIds = idsArray.slice(i, i + BATCH_SIZE);
        const models = await transactionQueryRepository.findByIds(workplaceId, chunkIds);
        allModelsToUpdate.push(...models);
      }

      // Fetch invalidated snapshots after the starting point
      const invalidatedSnapshots =
        idsNeedingUpdate.size > 0 || snapshotsToCreate.length > 0
          ? await balanceSnapshotRepository.findAfterDate(workplaceId, accountId, startDate)
          : [];

      // 5. Finalize inside database.write, preparing and batching SYNCHRONOUSLY to prevent diagnostic errors.
      await persistBatch(() => {
        const finalBatch: Model[] = [...extraOps];

        // Prepare updates for transaction running balances
        for (const m of allModelsToUpdate) {
          finalBatch.push(
            m.prepareUpdate((record: Transaction) => {
              record.runningBalance = idsNeedingUpdate.get(m.id) || 0;
            }),
          );
        }

        // Delete invalidated snapshots after the starting point
        if (invalidatedSnapshots.length > 0) {
          finalBatch.push(
            ...invalidatedSnapshots.map((s: BalanceSnapshot) => s.prepareDestroyPermanently()),
          );
        }

        // Create new snapshots
        if (snapshotsToCreate.length > 0) {
          finalBatch.push(
            ...snapshotsToCreate.map(data =>
              balanceSnapshotRepository.prepareCreate(workplaceId, {
                accountId,
                transactionId: data.transactionId,
                transactionDate: data.transactionDate,
                absoluteBalance: data.absoluteBalance,
                transactionCount: data.transactionCount,
              }),
            ),
          );
        }

        // Trigger lightweight reactive refreshes
        if (idsNeedingUpdate.size > 0 && !silent) {
          finalBatch.push(
            account.prepareUpdate(a => {
              a.updatedAt = new Date();
            }),
          );
        }

        return finalBatch;
      });
    }
  }
}

export const accountingRebuildService = new AccountingRebuildService();
