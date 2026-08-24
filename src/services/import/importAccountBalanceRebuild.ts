import Account from '@/src/data/models/Account';
import { accountingRebuildService } from '@/src/services/AccountingRebuildService';
import { WorkplaceId } from '@/src/types/ids';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';

export type ImportAccountBalanceRebuildProgress = (
  account: Pick<Account, 'id' | 'name'>,
  completed: number,
  total: number,
) => void;

/**
 * Rebuilds running balances for every account after import, with bounded parallelism.
 */
export async function rebuildAllAccountBalancesAfterImport(
  workplaceId: WorkplaceId,
  accounts: readonly Pick<Account, 'id' | 'name'>[],
  concurrency: number,
  onProgress?: ImportAccountBalanceRebuildProgress,
): Promise<void> {
  if (accounts.length === 0) {
    return;
  }

  let completed = 0;
  await runTasksWithBoundedConcurrency(accounts, concurrency, async account => {
    await accountingRebuildService.rebuildAccountBalances(workplaceId, account.id);
    completed += 1;
    onProgress?.(account, completed, accounts.length);
  });
}
