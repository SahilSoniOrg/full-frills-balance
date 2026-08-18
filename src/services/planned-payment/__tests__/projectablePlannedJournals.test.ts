import {
  isOrphanedPlannedJournal,
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

  it('detects a planned journal whose planned payment is gone', () => {
    expect(
      isOrphanedPlannedJournal({
        status: 'PLANNED',
        plannedPaymentId: 'pp-1',
        plannedPaymentExists: false,
      }),
    ).toBe(true);
    expect(
      isOrphanedPlannedJournal({
        status: 'PLANNED',
        plannedPaymentId: 'pp-1',
        plannedPaymentExists: true,
      }),
    ).toBe(false);
    expect(
      isOrphanedPlannedJournal({
        status: 'POSTED',
        plannedPaymentId: 'pp-1',
        plannedPaymentExists: false,
      }),
    ).toBe(false);
  });

  it('documents the orphaned planned journal notice', () => {
    expect(ORPHANED_PLANNED_JOURNAL_NOTICE).toMatch(/planned payment was deleted/i);
  });
});
