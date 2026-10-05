import type Account from '@/src/data/models/Account';
import type Journal from '@/src/data/models/Journal';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { JournalId } from '@/src/types/ids';
import {
  fixturePlannedPaymentDate as date,
  fixturePlannedPaymentObligation as payment,
  fixturePlannedPaymentSaved as saved,
} from '@/src/testing/plannedPaymentFixtures';
import { BehaviorSubject } from 'rxjs';
import {
  observePlannedPaymentListData,
  projectPlannedPaymentListOccurrences,
  type PlannedPaymentListData,
} from '../plannedPaymentReadService';

describe('planned list occurrence projection', () => {
  it('includes every occurrence through the horizon plus one later, using month-end recurrence', () => {
    const entries = projectPlannedPaymentListOccurrences(
      { items: [payment()], savedOccurrences: [] },
      date(3, 31),
    );
    expect(entries.map(item => item.date)).toEqual([
      date(1, 31),
      date(2, 28),
      date(3, 31),
      date(4, 30),
    ]);
  });

  it('preserves multiple overdue and future edits, replaces cursor days, and retains all saved journals', () => {
    const savedOccurrences = [
      saved(3),
      saved(10),
      saved(31),
      saved(31, {
        journalId: 'second-same-day' as JournalId,
        amount: 25,
        currencyCode: 'GBP',
      }),
      saved(1, { date: date(7, 1), amount: 321 }),
    ];
    const entries = projectPlannedPaymentListOccurrences(
      { items: [payment()], savedOccurrences },
      date(2, 28),
    );
    expect(entries.map(item => [item.date, item.amount, item.currencyCode])).toEqual([
      [date(1, 3), 75, 'EUR'],
      [date(1, 10), 75, 'EUR'],
      [date(1, 31), 75, 'EUR'],
      [date(1, 31), 25, 'GBP'],
      [date(2, 28), 100, 'USD'],
      [date(3, 31), 100, 'USD'],
      [date(7, 1), 321, 'EUR'],
    ]);
    expect(new Set(entries.map(item => item.occurrenceId)).size).toBe(entries.length);
  });

  it.each([PlannedPaymentStatus.PAUSED, PlannedPaymentStatus.COMPLETED])(
    'does not project %s schedules; saved pending entries keep the detail action policy',
    status => {
      const entries = projectPlannedPaymentListOccurrences(
        { items: [payment({ status })], savedOccurrences: [saved(3), saved(10)] },
        date(2, 28),
      );
      expect(entries).toHaveLength(2);
      expect(
        entries.every(item => item.canRecord === (status !== PlannedPaymentStatus.PAUSED)),
      ).toBe(true);
      expect(entries.map(item => item.journalId)).toEqual(['entry-3', 'entry-10']);
    },
  );

  it('includes the end date, skips dates before start, and stops when the cursor is past the end', () => {
    const data: PlannedPaymentListData = {
      items: [payment({ startDate: date(2, 1), endDate: date(3, 31) })],
      savedOccurrences: [],
    };
    expect(projectPlannedPaymentListOccurrences(data, date(5, 1)).map(item => item.date)).toEqual([
      date(2, 28),
      date(3, 31),
    ]);
    expect(
      projectPlannedPaymentListOccurrences(
        { ...data, items: [payment({ endDate: date(1, 30) })] },
        date(5, 1),
      ),
    ).toEqual([]);
    expect(
      projectPlannedPaymentListOccurrences(
        { ...data, items: [payment({ nextOccurrence: NaN })] },
        date(5, 1),
      ),
    ).toEqual([]);
  });

  it('uses multi-week recurrence across a year boundary', () => {
    const entries = projectPlannedPaymentListOccurrences(
      {
        items: [
          payment({
            intervalType: PlannedPaymentInterval.WEEKLY,
            intervalN: 2,
            recurrenceDay: undefined,
            startDate: date(12, 25),
            nextOccurrence: date(12, 25),
          }),
        ],
        savedOccurrences: [],
      },
      date(1, 31, 2027),
    );
    expect(entries.map(item => item.date)).toEqual([
      date(12, 25),
      date(1, 8, 2027),
      date(1, 22, 2027),
      date(2, 5, 2027),
    ]);
  });

  it('aligns a stale daily cursor to the schedule start without generating invalid years', () => {
    const entries = projectPlannedPaymentListOccurrences(
      {
        items: [
          payment({
            intervalType: PlannedPaymentInterval.DAILY,
            nextOccurrence: date(1, 1, 1970),
            startDate: date(1, 30),
            endDate: date(2, 2),
          }),
        ],
        savedOccurrences: [],
      },
      date(2, 28),
    );
    expect(entries.map(item => item.date)).toEqual([
      date(1, 30),
      date(1, 31),
      date(2, 1),
      date(2, 2),
    ]);
  });

  it('does not arbitrarily truncate legitimate overdue daily occurrences', () => {
    const entries = projectPlannedPaymentListOccurrences(
      {
        items: [
          payment({
            intervalType: PlannedPaymentInterval.DAILY,
            nextOccurrence: date(1, 1, 2020),
            startDate: date(1, 1, 2020),
          }),
        ],
        savedOccurrences: [],
      },
      date(1, 31),
    );
    const expectedDays = (Date.UTC(2026, 0, 31) - Date.UTC(2020, 0, 1)) / 86400000 + 2;
    expect(entries).toHaveLength(expectedDays);
    expect(entries.at(-1)?.date).toBe(date(2, 1));
  });

  it('restores February 29 on leap years for yearly schedules', () => {
    const entries = projectPlannedPaymentListOccurrences(
      {
        items: [
          payment({
            intervalType: PlannedPaymentInterval.YEARLY,
            intervalN: 4,
            recurrenceDay: 29,
            recurrenceMonth: 2,
            startDate: date(2, 29, 2028),
            nextOccurrence: date(2, 29, 2028),
          }),
        ],
        savedOccurrences: [],
      },
      date(2, 29, 2032),
    );
    expect(entries.map(item => item.date)).toEqual([
      date(2, 29, 2028),
      date(2, 29, 2032),
      date(2, 29, 2036),
    ]);
  });

  it('copies live saved amounts/currencies without changing the legacy rule amount', () => {
    const payments$ = new BehaviorSubject([payment() as unknown as PlannedPayment]);
    const journal = {
      id: 'entry',
      plannedPaymentId: 'plan',
      journalDate: date(1, 3),
      totalAmount: 70,
      currencyCode: 'EUR',
    } as Journal;
    const journals$ = new BehaviorSubject([journal]);
    const seen: PlannedPaymentListData[] = [];
    const subscription = observePlannedPaymentListData(
      payments$,
      journals$,
      new BehaviorSubject<Account[]>([]),
    ).subscribe(data => seen.push(data));
    journal.totalAmount = 90;
    journal.currencyCode = 'GBP';
    journals$.next([journal]);
    expect(seen[0].savedOccurrences[0]).toMatchObject({ amount: 70, currencyCode: 'EUR' });
    expect(seen[1].savedOccurrences[0]).toMatchObject({ amount: 90, currencyCode: 'GBP' });
    expect(seen[1].items[0]).toMatchObject({
      amount: 100,
      currencyCode: 'USD',
      outstandingJournalId: 'entry',
    });
    journals$.next([]);
    expect(seen[2].savedOccurrences).toEqual([]);
    subscription.unsubscribe();
  });
});
