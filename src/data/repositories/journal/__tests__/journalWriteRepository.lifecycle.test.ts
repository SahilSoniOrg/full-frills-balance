import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { JournalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';

const WORKPLACE = 'wp-lifecycle' as WorkplaceId;
const FOREIGN_WORKPLACE = 'wp-foreign' as WorkplaceId;

function journalFixture(workplaceId = WORKPLACE) {
  const operation = { kind: 'journal-update' } as unknown as Model;
  const journal = {
    id: 'journal-1',
    workplaceId,
    deletedAt: undefined,
    journalDate: 1_000,
    prepareUpdate: jest.fn((update: (record: Journal) => void) => {
      update(journal as unknown as Journal);
      return operation;
    }),
  } as unknown as Journal & { prepareUpdate: jest.Mock };

  return { journal, operation };
}

function transactionFixture(accountId: string, workplaceId = WORKPLACE) {
  const operation = { kind: `transaction-update-${accountId}` } as unknown as Model;
  const transaction = {
    id: `transaction-${accountId}`,
    workplaceId,
    accountId,
    amount: 25,
    transactionType: TransactionType.DEBIT,
    transactionDate: 1_000,
    prepareUpdate: jest.fn((update: (record: Transaction) => void) => {
      update(transaction as unknown as Transaction);
      return operation;
    }),
  } as unknown as Transaction & { prepareUpdate: jest.Mock };

  return { transaction, operation };
}

describe('JournalWriteRepository lifecycle preparation', () => {
  const repository = new JournalWriteRepository();

  it('returns journal then transaction operations for every lifecycle transition', () => {
    const deletedAt = new Date(2_000);
    const deleteJournal = journalFixture();
    const deleteTransaction = transactionFixture('cash');
    expect(
      repository.prepareDeleteJournalUpdates(
        deleteJournal.journal,
        [deleteTransaction.transaction],
        WORKPLACE,
        deletedAt,
      ),
    ).toEqual([deleteJournal.operation, deleteTransaction.operation]);
    expect(deleteJournal.journal.deletedAt).toBe(deletedAt);
    expect(deleteTransaction.transaction.deletedAt).toBe(deletedAt);

    const recoverJournal = journalFixture();
    const recoverTransaction = transactionFixture('cash');
    expect(
      repository.prepareRecoverJournalUpdates(
        recoverJournal.journal,
        [recoverTransaction.transaction],
        WORKPLACE,
        deletedAt,
      ),
    ).toEqual([recoverJournal.operation, recoverTransaction.operation]);
    expect(recoverJournal.journal.deletedAt).toBeUndefined();
    expect(recoverTransaction.transaction.deletedAt).toBeUndefined();

    const postJournal = journalFixture();
    const postTransaction = transactionFixture('cash');
    expect(
      repository.preparePostJournalUpdates(
        postJournal.journal,
        [postTransaction.transaction],
        WORKPLACE,
        3_000,
      ),
    ).toEqual([postJournal.operation, postTransaction.operation]);
    expect(postJournal.journal.status).toBe(JournalStatus.POSTED);
    expect(postJournal.journal.journalDate).toBe(3_000);
    expect(postTransaction.transaction.transactionDate).toBe(3_000);

    const revertJournal = journalFixture();
    const revertTransaction = transactionFixture('cash');
    expect(
      repository.prepareRevertJournalUpdates(
        revertJournal.journal,
        [revertTransaction.transaction],
        WORKPLACE,
        4_000,
      ),
    ).toEqual([revertJournal.operation, revertTransaction.operation]);
    expect(revertJournal.journal.status).toBe(JournalStatus.PLANNED);
    expect(revertJournal.journal.journalDate).toBe(4_000);
    expect(revertTransaction.transaction.transactionDate).toBe(4_000);
  });

  it('rejects lifecycle preparation for models from another workplace', () => {
    const journal = journalFixture();
    const transaction = transactionFixture('cash', FOREIGN_WORKPLACE);

    expect(() =>
      repository.prepareDeleteJournalUpdates(
        journal.journal,
        [transaction.transaction],
        WORKPLACE,
        new Date(),
      ),
    ).toThrow(
      `Transaction ${transaction.transaction.id} does not belong to workplace ${WORKPLACE}`,
    );
    expect(journal.journal.prepareUpdate).not.toHaveBeenCalled();
    expect(transaction.transaction.prepareUpdate).not.toHaveBeenCalled();
  });
});
