import { accountQueryRepository } from './AccountQueryRepository';
import { accountWriteRepository } from './AccountWriteRepository';
import type Account from '@/src/data/models/Account';
import type { WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';

export interface AccountTreeTransactionPlan<T> {
  /**
   * Prepare all Watermelon operations synchronously immediately before batch.
   * The planner may perform async reads, but must not call prepare* methods.
   */
  prepareOps: () => readonly Model[];
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
    return accountWriteRepository.commitMutationPlan(async () => {
      // Load exactly once after acquiring the write lock so the plan and its
      // receipt describe the same workplace-scoped state that is committed.
      const accounts = await accountQueryRepository.findAll(workplaceId);
      return plan(accounts);
    });
  }
}

export const accountTreeTransactionCoordinator = new AccountTreeTransactionCoordinator();
