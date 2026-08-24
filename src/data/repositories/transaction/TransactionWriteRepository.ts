import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { WorkplaceId } from '@/src/types/ids';
import { roundToPrecision } from '@/src/utils/money';
import { transactionQueryRepository } from './TransactionQueryRepository';

export class TransactionWriteRepository {
  private get db() {
    return database;
  }

  private get transactions() {
    return this.db.collections.get<Transaction>('transactions');
  }

  /**
   * Creates a new transaction
   * @param transactionData Transaction data to create
   * @param precision Amount precision rounding (default: 2)
   * @param enforcePositiveAmount If true, will throw if amount is not positive
   * @param workplaceId Workplace ID
   * @returns The created transaction
   * @throws {Error} If amount is not positive and enforcePositiveAmount is true
   */
  async create(
    transactionData: Omit<
      Partial<Transaction>,
      'id' | 'createdAt' | 'updatedAt' | 'running_balance'
    >,
    precision: number = 2,
    enforcePositiveAmount: boolean = true,
    workplaceId: WorkplaceId,
  ): Promise<Transaction> {
    if (
      enforcePositiveAmount &&
      transactionData.amount !== undefined &&
      transactionData.amount <= 0
    ) {
      throw new Error(
        'Transaction amount must be positive. Sign is determined by transactionType.',
      );
    }

    if (transactionData.workplaceId && transactionData.workplaceId !== workplaceId) {
      throw new Error('Transaction workplaceId mismatch');
    }
    transactionData.workplaceId = workplaceId;

    if (!transactionData.transactionType) {
      throw new Error('transactionType is required for transaction creation');
    }

    const accountId = transactionData.accountId;
    if (!accountId) throw new Error('accountId is required for transaction creation');

    return this.db.write(async () => {
      const created = await this.transactions.create(transaction => {
        Object.assign(transaction, {
          ...transactionData,
          amount: roundToPrecision(Math.abs(transactionData.amount || 0), precision),
          running_balance: null,
        });
        transaction.createdAt = new Date();
        transaction.updatedAt = new Date();
      });

      return created;
    });
  }

  async update(
    transaction: Transaction,
    updates: Partial<Transaction>,
    workplaceId: WorkplaceId,
  ): Promise<Transaction> {
    const txn = await transactionQueryRepository.findByJournal(workplaceId, transaction.journalId);
    if (!txn || txn.length === 0) {
      throw new Error('Transaction not found or does not belong to the workplace');
    }
    return this.db.write(async () => {
      const updated = await transaction.update(tx => {
        Object.assign(tx, updates);
        tx.updatedAt = new Date();
      });

      return updated;
    });
  }

  async delete(workplaceId: WorkplaceId, transaction: Transaction): Promise<void> {
    const txn = await transactionQueryRepository.findByJournal(workplaceId, transaction.journalId);
    if (!txn || txn.length === 0) {
      throw new Error('Transaction not found or does not belong to the workplace');
    }
    return this.db.write(async () => {
      await transaction.update(t => {
        t.deletedAt = new Date();
      });
    });
  }
}

export const transactionWriteRepository = new TransactionWriteRepository();
