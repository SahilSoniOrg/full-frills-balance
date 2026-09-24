import Journal from '@/src/data/models/Journal';
import { JournalPlannedQueries } from '@/src/data/repositories/journal/JournalPlannedQueries';
import { JournalStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';

const WORKPLACE = 'wp-local' as WorkplaceId;
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

describe('JournalPlannedQueries preparation', () => {
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

  it('refuses to prepare a planned-state update that would post a journal', () => {
    const repository = new JournalPlannedQueries();
    const journal = journalFixture();

    expect(() =>
      repository.prepareStatusUpdates(WORKPLACE, [journal.journal], JournalStatus.POSTED as never),
    ).toThrow(/Unsupported planned journal status/);
    expect(journal.journal.prepareUpdate).not.toHaveBeenCalled();
  });
});
