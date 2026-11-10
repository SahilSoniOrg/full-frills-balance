import { matchSharedMovement, type MovementMatchFacts } from '../sharedMovementMatcher';

const obs = {
  id: 'sms1',
  channel: 'sms' as const,
  amount: 100,
  currency: 'USD',
  accountId: 'bank',
  direction: 'debit' as const,
  date: Date.UTC(2026, 0, 10),
};
const occurrence = (overrides = {}) => ({
  id: 'occ1',
  planId: 'p1',
  status: 'active' as const,
  date: obs.date,
  intervalDays: 30,
  amount: 100,
  currency: 'USD',
  accountId: 'bank',
  direction: 'debit' as const,
  ...overrides,
});
const facts = (overrides: Partial<MovementMatchFacts> = {}): MovementMatchFacts => ({
  observation: obs,
  occurrences: [occurrence()],
  pendingObservations: [],
  captureJournals: [],
  journals: [],
  today: obs.date,
  ...overrides,
});

describe('matchSharedMovement', () => {
  it('returns a two-sided unique strict match', () =>
    expect(matchSharedMovement(facts()).kind).toBe('strictUnique'));
  it('blocks when a second pending observation matches', () =>
    expect(matchSharedMovement(facts({ pendingObservations: [{ ...obs, id: 'sms2' }] })).kind).toBe(
      'ambiguous',
    ));
  it('returns near amount as soft review', () =>
    expect(matchSharedMovement(facts({ occurrences: [occurrence({ amount: 104 })] })).kind).toBe(
      'soft',
    ));
  it('returns a date +2 match as soft review', () =>
    expect(
      matchSharedMovement(facts({ observation: { ...obs, date: obs.date + 2 * 86400000 } })).kind,
    ).toBe('soft'));
  it('caps daily plans to same day', () =>
    expect(
      matchSharedMovement(
        facts({
          occurrences: [occurrence({ intervalDays: 1 })],
          observation: { ...obs, date: obs.date + 86400000 },
        }),
      ).kind,
    ).toBe('none'));
  it.each([{ status: 'paused' }, { status: 'completed' }, { skipped: true }, { claimed: true }])(
    'excludes ineligible occurrence %o',
    x => expect(matchSharedMovement(facts({ occurrences: [occurrence(x)] })).kind).toBe('none'),
  );
  it('excludes future horizon occurrence', () =>
    expect(
      matchSharedMovement(facts({ occurrences: [occurrence({ date: obs.date + 10 * 86400000 })] }))
        .kind,
    ).toBe('none'));
  it('detects structural conflict', () =>
    expect(
      matchSharedMovement(
        facts({
          occurrences: [occurrence({ structure: 'transfer' })],
          observation: { ...obs, economicKind: 'expense' },
        }),
      ).kind,
    ).toBe('conflict'));
  it('uses the edited occurrence amount', () =>
    expect(
      matchSharedMovement(
        facts({
          observation: { ...obs, amount: 110 },
          occurrences: [occurrence({ visibleAmount: 110 })],
        }),
      ).kind,
    ).toBe('strictUnique'));
  it('does not soft-match arbitrary amount merely because the date is soft', () =>
    expect(
      matchSharedMovement(
        facts({ observation: { ...obs, date: obs.date + 2 * 86400000, amount: 200 } }),
      ).kind,
    ).toBe('none'));
  it('routes matching FX occurrences to review', () =>
    expect(
      matchSharedMovement(facts({ occurrences: [occurrence({ fxMode: 'manual' })] })).kind,
    ).toBe('soft'));
  it('does not silently attach same-channel second observation', () =>
    expect(
      matchSharedMovement(
        facts({
          journals: [
            {
              id: 'posted',
              planLinked: true,
              status: 'posted',
              channel: 'sms',
              date: obs.date,
              amount: 100,
              currency: 'USD',
              accountId: 'bank',
              direction: 'debit',
            },
          ],
        }),
      ).kind,
    ).toBe('reviewSameChannel'));
  it('silent-attaches cross-channel when journal_date differs from occurrence but ORIGINAL_PLANNED_DATE matches', () => {
    const occurrenceDay = obs.date;
    const journalDate = obs.date + 86_400_000;
    const result = matchSharedMovement(
      facts({
        observation: { ...obs, channel: 'email', date: journalDate },
        journals: [
          {
            id: 'posted',
            planLinked: true,
            status: 'posted',
            channel: 'sms',
            date: journalDate,
            originalPlannedDate: occurrenceDay,
            amount: 100,
            currency: 'USD',
            accountId: 'bank',
            direction: 'debit',
          },
        ],
      }),
    );
    expect(result).toMatchObject({ kind: 'strictUnique', silentAttach: true });
  });
  it('routes same-channel to review when journal_date differs from occurrence but ORIGINAL_PLANNED_DATE matches', () => {
    const occurrenceDay = obs.date;
    const journalDate = obs.date + 86_400_000;
    expect(
      matchSharedMovement(
        facts({
          observation: { ...obs, date: journalDate },
          journals: [
            {
              id: 'posted',
              planLinked: true,
              status: 'posted',
              channel: 'sms',
              date: journalDate,
              originalPlannedDate: occurrenceDay,
              amount: 100,
              currency: 'USD',
              accountId: 'bank',
              direction: 'debit',
            },
          ],
        }),
      ).kind,
    ).toBe('reviewSameChannel');
  });
  it('keeps strict candidates when another occurrence forces review', () => {
    const softOccurrence = occurrence({ id: 'soft', date: obs.date + 2 * 86400000 });
    expect(
      matchSharedMovement(facts({ occurrences: [occurrence(), softOccurrence] })),
    ).toMatchObject({ kind: 'soft', candidates: [{ id: 'occ1' }, { id: 'soft' }] });
  });
  it('includes the soft upper horizon for early debit matching', () =>
    expect(
      matchSharedMovement(
        facts({ today: obs.date - 4 * 86400000, occurrences: [occurrence({ date: obs.date })] }),
      ).kind,
    ).toBe('strictUnique'));
  it('matches a transfer to-account visible leg', () =>
    expect(
      matchSharedMovement(
        facts({
          observation: { ...obs, accountId: 'other-bank' },
          occurrences: [occurrence({ toAccountId: 'other-bank' })],
        }),
      ).kind,
    ).toBe('strictUnique'));
});
