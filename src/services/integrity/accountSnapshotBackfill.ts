import { accountQueryRepository } from '@/src/data/repositories/account';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { AppConfig } from '@/src/constants/app-config';
import { WorkplaceId } from '@/src/types/ids';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';
import { storage } from '@/src/data/storage/storage';

const ACCOUNT_SNAPSHOT_BACKFILL_KEY = '@integrity_account_snapshot_backfill_version';
const ACCOUNT_SNAPSHOT_BACKFILL_VERSION = '2';

export async function backfillAccountSnapshotsIfNeeded(
  workplaceId: WorkplaceId,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<boolean> {
  const key = `${ACCOUNT_SNAPSHOT_BACKFILL_KEY}_${workplaceId}`;
  const storedVersion = storage.getString(key);
  if (storedVersion === ACCOUNT_SNAPSHOT_BACKFILL_VERSION) {
    return false;
  }

  const accounts = await accountQueryRepository.findAll(workplaceId);
  if (accounts.length === 0) {
    return false;
  }

  let completed = 0;
  let incomplete = false;
  await runTasksWithBoundedConcurrency(
    accounts,
    AppConfig.performance.import.postImportAccountRebuildConcurrency,
    async account => {
      if (signal?.aborted) return;
      const rebuilt = await accountingRebuildService.rebuildAccountBalances(
        workplaceId,
        account.id,
        undefined,
        [],
        signal,
      );
      if (!rebuilt) {
        incomplete = true;
        return;
      }
      completed += 1;
      onProgress?.(completed, accounts.length);
    },
  );

  if (!signal?.aborted && !incomplete) {
    storage.set(key, ACCOUNT_SNAPSHOT_BACKFILL_VERSION);
    return true;
  }

  return false;
}
