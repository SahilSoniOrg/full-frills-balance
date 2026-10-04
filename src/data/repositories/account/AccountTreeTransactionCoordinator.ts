import { accountQueryRepository } from './AccountQueryRepository';
import { accountWriteRepository } from './AccountWriteRepository';
import type Account from '@/src/data/models/Account';
import type { WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';

export interface AccountTreeTransactionPlan<T> {
  prepareOps: () => readonly Model[];
  result: T;
}

export class AccountTreeTransactionCoordinator {
  async run<T>(
    workplaceId: WorkplaceId,
    plan: (accounts: readonly Account[]) => Promise<AccountTreeTransactionPlan<T>>,
  ): Promise<T> {
    return accountWriteRepository.commitMutationPlan(async () => {
      const accounts = await accountQueryRepository.findAll(workplaceId);
      return plan(accounts);
    });
  }
}

export const accountTreeTransactionCoordinator = new AccountTreeTransactionCoordinator();
