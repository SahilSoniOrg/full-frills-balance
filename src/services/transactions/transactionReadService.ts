import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { WorkplaceId } from '@/src/types/ids';

/** Read-side transaction operations shared by feature hooks. */
export const transactionReadService = {
  findEarliest(workplaceId: WorkplaceId) {
    return transactionQueryRepository.findEarliest(workplaceId);
  },
};
