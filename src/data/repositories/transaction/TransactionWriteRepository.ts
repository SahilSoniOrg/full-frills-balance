import type Transaction from '@/src/data/models/Transaction';
import type { WorkplaceId } from '@/src/types/ids';

export class TransactionWriteRepository {
  /**
   * Prepares a running-balance cache update for a transaction owned by the workplace.
   * The caller owns the write and is responsible for batching the prepared operation.
   */
  prepareRunningBalanceUpdate(
    workplaceId: WorkplaceId,
    transaction: Transaction,
    runningBalance: number,
  ): Transaction {
    if (transaction.workplaceId !== workplaceId) {
      throw new Error('Transaction does not belong to the specified workplace');
    }

    return transaction.prepareUpdate(record => {
      record.runningBalance = runningBalance;
    });
  }
}

export const transactionWriteRepository = new TransactionWriteRepository();
