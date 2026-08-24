import { database } from '@/src/data/database/Database';
import { accountQueryRepository } from './AccountQueryRepository';
import type Account from '@/src/data/models/Account';
import type { WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';

export interface AccountTreeTransactionPlan<T> {
  ops: readonly Model[];
  result: T;
}

/**
 * Transaction seam for account-tree mutations. The command validates and
 * prepares intent; this coordinator owns the single writer and batch.
 */
export class AccountTreeTransactionCoordinator {
  async run<T>(
    workplaceId: WorkplaceId,
    plan: (accounts: readonly Account[]) => Promise<AccountTreeTransactionPlan<T>>,
  ): Promise<T> {
    return database.write(async () => {
      // Load exactly once after acquiring the write lock so the plan and its
      // receipt describe the same workplace-scoped state that is committed.
      const accounts = await accountQueryRepository.findAll(workplaceId);
      const prepared = await plan(accounts);
      if (prepared.ops.length > 0) {
        await database.batch(...prepared.ops);
      }
      return prepared.result;
    });
  }
}

export const accountTreeTransactionCoordinator = new AccountTreeTransactionCoordinator();
