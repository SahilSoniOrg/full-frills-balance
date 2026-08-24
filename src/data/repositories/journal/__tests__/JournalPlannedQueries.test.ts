import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { JournalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';

const WORKPLACE = 'wp-local' as WorkplaceId;
const FOREIGN_WORKPLACE = 'wp-foreign' as WorkplaceId;

function journalFixture(id = 'journal-1', workplaceId = WORKPLACE) {
  const operation = { kind: 'journal-delete' } as unknown as Model;
  const journal = {
    id,
    workplaceId,
    prepareUpdate: jest.fn((update: (record: Journal) => void) => {
      update(journal as unknown as Journal);
      return operation;
    }),
  } as unknown as Journal & { prepareUpdate: jest.Mock };
  return { journal, operation };
}

function transactionFixture(workplaceId = WORKPLACE) {
  const operation = { kind: 'transaction-delete' } as unknown as Model;
  const transaction = {
    id: 'transaction-1',
    workplaceId,
    transactionType: TransactionType.DEBIT,
    prepareUpdate: jest.fn((update: (record: Transaction) => void) => {
      update(transaction as unknown as Transaction);
      return operation;
    }),
  } as unknown as Transaction & { prepareUpdate: jest.Mock };
  return { transaction, operation };
}

describe('JournalPlannedQueries preparation', () => {
  it('returns journal operations before transaction operations and applies one deletion time', () => {
    const repository = new JournalPlannedQueries();
    const journal = journalFixture();
    const transaction = transactionFixture();
    const deletedAt = new Date(2_000);

    const operations = repository.prepareSoftDeleteUpdates(
      WORKPLACE,
      [journal.journal],
      [transaction.transaction],
      deletedAt,
    );

    expect(operations).toEqual([journal.operation, transaction.operation]);
    expect(journal.journal.prepareUpdate).toHaveBeenCalledTimes(1);
    expect(transaction.transaction.prepareUpdate).toHaveBeenCalledTimes(1);
    expect(journal.journal.deletedAt).toBe(deletedAt);
    expect(journal.journal.updatedAt).toBe(deletedAt);
    expect(transaction.transaction.deletedAt).toBe(deletedAt);
    expect(transaction.transaction.updatedAt).toBe(deletedAt);
  });

  it('resolves per-journal status while preserving order and ownership checks', () => {
    const repository = new JournalPlannedQueries();
    const future = journalFixture('future');
    const past = journalFixture('past');
    future.journal.journalDate = 2_000;
    past.journal.journalDate = 1_000;

    const operations = repository.prepareStatusUpdates(
      WORKPLACE,
      [future.journal, past.journal],
      journal => (journal.id === 'future' ? JournalStatus.PLANNED : JournalStatus.SKIPPED),
    );

    expect(operations).toEqual([future.operation, past.operation]);
    expect(future.journal.status).toBe(JournalStatus.PLANNED);
    expect(past.journal.status).toBe(JournalStatus.SKIPPED);
  });

  it('rejects a foreign transaction before preparing any deletion mutation', () => {
    const repository = new JournalPlannedQueries();
    const journal = journalFixture();
    const transaction = transactionFixture(FOREIGN_WORKPLACE);

    expect(() =>
      repository.prepareSoftDeleteUpdates(
        WORKPLACE,
        [journal.journal],
        [transaction.transaction],
        new Date(),
      ),
    ).toThrow(
      `Transaction ${transaction.transaction.id} does not belong to workplace ${WORKPLACE}`,
    );
    expect(journal.journal.prepareUpdate).not.toHaveBeenCalled();
    expect(transaction.transaction.prepareUpdate).not.toHaveBeenCalled();
  });
});
