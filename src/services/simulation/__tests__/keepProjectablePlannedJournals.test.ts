import { keepProjectablePlannedJournals } from '../keepProjectablePlannedJournals';

describe('keepProjectablePlannedJournals', () => {
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
});
