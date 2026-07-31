import Transaction from '@/src/data/models/Transaction';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { WorkplaceId } from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';

/** Read-side transaction operations shared by feature hooks. */
export const transactionReadService = {
  async findEarliest(workplaceId: WorkplaceId): Promise<Transaction | null> {
    const transactions = await transactionRepository
      .transactionsQuery(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', Q.asc),
        Q.take(1),
      )
      .fetch();

    return transactions[0] ?? null;
  },
};
