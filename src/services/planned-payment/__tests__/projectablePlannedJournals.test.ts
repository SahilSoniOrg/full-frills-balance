import {
  keepProjectablePlannedJournals,
  ORPHANED_PLANNED_JOURNAL_NOTICE,
} from '../projectablePlannedJournals';

describe('projectablePlannedJournals', () => {
  it('drops journals whose planned payment is missing from the active set', () => {
    const kept = keepProjectablePlannedJournals(
      [
        { id: 'orphan', plannedPaymentId: 'pp-gone' },
        { id: 'linked', plannedPaymentId: 'pp-live' },
        { id: 'manual' },
      ],
      [{ id: 'pp-live' }],
    );

    expect(kept.map(journal => journal.id)).toEqual(['linked', 'manual']);
  });

  it('documents the orphaned planned journal notice', () => {
    expect(ORPHANED_PLANNED_JOURNAL_NOTICE).toMatch(/planned payment was deleted/i);
  });
});
