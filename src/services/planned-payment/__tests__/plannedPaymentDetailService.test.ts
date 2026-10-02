import {
  getNextPlannedPaymentOccurrences,
  summarizePlannedPaymentActivity,
} from '../plannedPaymentDetailService';
import {
  JournalDisplayType,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId } from '@/src/types/ids';
import type { PlainJournal, PlainPlannedPayment } from '@/src/types/plainDtos';

const date = (month: number, day: number) => new Date(2026, month - 1, day).getTime();
const payment: PlainPlannedPayment = {
  id: 'plan' as PlannedPaymentId,
  name: 'Rent',
  amount: 100,
  currencyCode: 'USD',
  fromAccountId: 'cash' as AccountId,
  toAccountId: 'housing' as AccountId,
  intervalN: 1,
  intervalType: PlannedPaymentInterval.MONTHLY,
  recurrenceDay: 31,
  startDate: date(1, 31),
  nextOccurrence: date(1, 31),
  status: PlannedPaymentStatus.ACTIVE,
  isAutoPost: false,
};
const journal = (overrides: Partial<PlainJournal> = {}): PlainJournal => ({
  id: 'entry' as JournalId,
  journalDate: date(1, 31),
  totalAmount: 100,
  currencyCode: 'USD',
  status: JournalStatus.POSTED,
  displayType: JournalDisplayType.EXPENSE,
  transactionCount: 2,
  ...overrides,
});

describe('planned payment detail data', () => {
  it('summarizes more than one history page, preserves currencies, and excludes skipped/reversed payments', () => {
    const history = Array.from({ length: 25 }, (_, index) =>
      journal({ id: `posted-${index}` as JournalId, totalAmount: 1.01 }),
    );
    const summary = summarizePlannedPaymentActivity(
      [
        ...history,
        journal({
          id: 'eur' as JournalId,
          currencyCode: 'EUR',
          totalAmount: 3.25,
          journalDate: date(2, 28),
        }),
        journal({ status: JournalStatus.SKIPPED, totalAmount: 999 }),
        journal({ status: JournalStatus.REVERSED, totalAmount: 999 }),
        journal({ originalJournalId: 'reversed-original' as JournalId, totalAmount: 999 }),
        journal({ status: JournalStatus.PLANNED, journalDate: date(3, 1) }),
        journal({ status: JournalStatus.PLANNED, journalDate: date(3, 2) }),
        journal({ status: JournalStatus.PAUSED }),
      ],
      date(3, 2),
    );
    expect(summary).toMatchObject({
      recordedCount: 26,
      skippedCount: 1,
      reversedCount: 1,
      pendingCount: 2,
      overdueCount: 1,
      pausedCount: 1,
    });
    expect(summary.recordedTotals).toEqual([
      { currencyCode: 'EUR', amount: 3.25 },
      { currencyCode: 'USD', amount: 25.25 },
    ]);
    expect(summary.lastRecorded?.id).toBe('eur');
  });

  it('uses the recurrence engine to clamp February and restore day 31 in March', () => {
    expect(getNextPlannedPaymentOccurrences(payment, []).map(item => item.date)).toEqual([
      date(1, 31),
      date(2, 28),
      date(3, 31),
    ]);
  });

  it('keeps edited saved amounts and deduplicates cursor dates', () => {
    const saved = journal({
      id: 'edited' as JournalId,
      status: JournalStatus.PLANNED,
      totalAmount: 75,
      currencyCode: 'EUR',
      journalDate: date(2, 28),
    });
    const entries = getNextPlannedPaymentOccurrences({ ...payment, nextOccurrence: date(2, 28) }, [
      journal(),
      saved,
    ]);
    expect(entries).toEqual([
      { date: date(2, 28), amount: 75, currencyCode: 'EUR', journalId: saved.id },
      { date: date(3, 31), amount: 100, currencyCode: 'USD' },
      { date: date(4, 30), amount: 100, currencyCode: 'USD' },
    ]);
  });

  it('does not confuse the recording date of an overdue payment with a separate still-due occurrence', () => {
    const entries = getNextPlannedPaymentOccurrences(payment, [
      journal({ journalDate: payment.nextOccurrence }),
    ]);
    expect(entries[0]?.date).toBe(payment.nextOccurrence);
  });

  it('honors finite schedules and hides projections while paused', () => {
    expect(
      getNextPlannedPaymentOccurrences({ ...payment, endDate: date(2, 28) }, []).map(
        item => item.date,
      ),
    ).toEqual([date(1, 31), date(2, 28)]);
    expect(
      getNextPlannedPaymentOccurrences({ ...payment, status: PlannedPaymentStatus.PAUSED }, [
        journal({ status: JournalStatus.PLANNED }),
      ]),
    ).toEqual([]);
  });

  it('retains existing unpaid occurrences after completion without inventing new dates', () => {
    const saved = journal({ status: JournalStatus.PLANNED });
    expect(
      getNextPlannedPaymentOccurrences({ ...payment, status: PlannedPaymentStatus.COMPLETED }, [
        saved,
      ]),
    ).toEqual([{ date: saved.journalDate, amount: 100, currencyCode: 'USD', journalId: saved.id }]);
  });
});
