import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { WorkplaceId } from '@/src/types/domain';

/** Read-side transaction operations shared by feature hooks. */
export const transactionReadService = {
  findEarliest(workplaceId: WorkplaceId) {
    return transactionRepository.findEarliest(workplaceId);
  },
};
