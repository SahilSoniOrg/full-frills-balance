import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId } from '@/src/types/ids';
import type {
  PlannedPaymentListData,
  PlannedPaymentObligation,
  PlannedPaymentSavedOccurrence,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { buildPlannedPaymentListPresentation } from '../plannedPaymentListPresentation';

const date = (month: number, day: number, year = 2026, hour = 0) =>
  new Date(year, month - 1, day, hour).getTime();
const payment = (
  id: string,
  overrides: Partial<PlannedPaymentObligation> = {},
): PlannedPaymentObligation => ({
  id: id as PlannedPaymentId,
  name: id,
  amount: 100,
  currencyCode: 'USD',
  fromAccountId: 'cash' as AccountId,
  toAccountId: 'rent' as AccountId,
  intervalN: 1,
  intervalType: PlannedPaymentInterval.MONTHLY,
  recurrenceDay: 3,
  startDate: date(10, 3),
  nextOccurrence: date(10, 3),
  status: PlannedPaymentStatus.ACTIVE,
  isAutoPost: false,
  flowDirection: 'outflow',
  ...overrides,
});
const saved = (
  id: string,
  plan: string,
  due: number,
  amount = 100,
  currencyCode = 'USD',
): PlannedPaymentSavedOccurrence => ({
  journalId: id as JournalId,
  plannedPaymentId: plan as PlannedPaymentId,
  date: due,
  amount,
  currencyCode,
});
const build = (data: PlannedPaymentListData, now = date(10, 3), currency = 'USD') =>
  buildPlannedPaymentListPresentation(data, currency, now);

describe('planned list presentation', () => {
  it('counts every daily occurrence through month end, including multiple overdue on one schedule', () => {
    const list = build({
      items: [
        payment('daily', {
          startDate: date(10, 1),
          nextOccurrence: date(10, 1),
          intervalType: PlannedPaymentInterval.DAILY,
          amount: 0.1,
        }),
      ],
      savedOccurrences: [
        saved('sep', 'daily', date(9, 30), 10),
        saved('oct1', 'daily', date(10, 1), 0.2),
        saved('oct2', 'daily', date(10, 2), 0.3),
      ],
    });
    expect(list.summary.outgoing).toMatchObject({
      count: 32,
      mainCurrency: { amount: 13.4, count: 32 },
      otherCurrencyCount: 0,
    });
    expect(list.groups.map(group => [group.key, group.rows.length])).toEqual([
      ['overdue', 3],
      ['next7Days', 7],
      ['laterThisMonth', 22],
      ['nextMonth', 30],
      ['later', 1],
      ['pausedEnded', 0],
    ]);
    expect(list.groups[0].outgoing.mainCurrency.amount).toBe(10.5);
    expect(list.monthStrip).toHaveLength(31);
    expect(list.monthStrip[0]).toMatchObject({
      day: 1,
      isPast: true,
      isToday: false,
      outgoingAmount: 0.2,
    });
    expect(list.monthStrip[2]).toMatchObject({
      day: 3,
      isPast: false,
      isToday: true,
      outgoingAmount: 0.1,
    });
    expect(list.monthStrip[30].outgoingAmount).toBe(0.1);
  });

  it('keeps edited amounts/currencies per occurrence and counts transfers as outgoing; unknown stays visible', () => {
    const list = build({
      items: [
        payment('expense'),
        payment('income', { flowDirection: 'inflow' }),
        payment('transfer', { flowDirection: 'transfer', amount: 50 }),
        payment('unknown', { flowDirection: 'unknown', amount: 999 }),
      ],
      savedOccurrences: [
        saved('eur1', 'expense', date(10, 3), 60, 'EUR'),
        saved('eur2', 'expense', date(10, 20), 30, 'EUR'),
        saved('usd', 'expense', date(10, 21), 15),
        saved('gbp', 'income', date(9, 30), 7, 'GBP'),
      ],
    });
    expect(list.summary.outgoing).toEqual({
      perCurrency: [
        { currencyCode: 'EUR', amount: 90, count: 2 },
        { currencyCode: 'USD', amount: 65, count: 2 },
      ],
      mainCurrency: { currencyCode: 'USD', amount: 65, count: 2 },
      count: 4,
      otherCurrencyCount: 2,
    });
    expect(list.summary.incoming).toMatchObject({
      count: 2,
      otherCurrencyCount: 1,
      mainCurrency: { amount: 100 },
    });
    expect(list.summary.unknownCount).toBe(1);
    expect(list.groups[1].rows.some(row => row.payment.id === 'unknown')).toBe(true);
    expect(list.groups[1].outgoing.mainCurrency.amount).toBe(50);
    expect(list.monthStrip[2]).toMatchObject({
      outgoingAmount: 50,
      incomingAmount: 100,
    });
    const eurList = build({
      items: [payment('foreign', { currencyCode: 'EUR' })],
      savedOccurrences: [],
    });
    expect(eurList.summary.outgoing.mainCurrency).toEqual({
      currencyCode: 'USD',
      amount: 0,
      count: 0,
    });
    expect(eurList.summary.outgoing.otherCurrencyCount).toBe(1);
  });

  it('keeps completed pending occurrences actionable while paused schedules follow the detail resolver', () => {
    const list = build({
      items: [
        payment('completed', { status: PlannedPaymentStatus.COMPLETED }),
        payment('paused', { status: PlannedPaymentStatus.PAUSED }),
        payment('ended', { status: PlannedPaymentStatus.COMPLETED }),
        payment('expired', { endDate: date(10, 2) }),
      ],
      savedOccurrences: [
        saved('completed1', 'completed', date(9, 1), 25),
        saved('completed2', 'completed', date(10, 3), 35),
        saved('paused1', 'paused', date(10, 1), 999),
      ],
    });
    expect(list.summary.outgoing).toMatchObject({ count: 2, mainCurrency: { amount: 60 } });
    expect(list.groups[0].rows).toEqual([
      expect.objectContaining({ journalId: 'completed1', canRecord: true }),
    ]);
    expect(list.groups[1].rows).toEqual([
      expect.objectContaining({ journalId: 'completed2', amount: 35, canRecord: true }),
    ]);
    expect(list.groups.slice(2, 5).every(group => group.rows.length === 0)).toBe(true);
    expect(list.groups[5].rows.map(row => row.payment.id)).toEqual(['ended', 'expired', 'paused']);
    expect(list.groups[5].rows[2]).toMatchObject({
      kind: 'schedule',
      pendingOccurrences: [{ journalId: 'paused1', canRecord: false, amount: 999 }],
    });
  });

  it('uses seven calendar days including today across week, month, and year boundaries', () => {
    const plan = payment('plan', { status: PlannedPaymentStatus.COMPLETED });
    const list = build(
      {
        items: [plan],
        savedOccurrences: [
          saved('overdue', 'plan', date(12, 30, 2026, 23)),
          saved('today', 'plan', date(12, 31, 2026, 23)),
          saved('six', 'plan', date(1, 6, 2027, 23)),
          saved('seven', 'plan', date(1, 7, 2027)),
          saved('lastNextMonth', 'plan', date(1, 31, 2027)),
          saved('later', 'plan', date(2, 1, 2027)),
        ],
      },
      date(12, 31, 2026, 12),
    );
    expect(
      list.groups.map(group =>
        group.rows.map(row => (row.kind === 'occurrence' ? row.journalId : row.payment.id)),
      ),
    ).toEqual([['overdue'], ['today', 'six'], [], ['seven', 'lastNextMonth'], ['later'], []]);
    expect(list.summary.outgoing).toMatchObject({ count: 2, mainCurrency: { amount: 200 } });
    expect(list.nextMonthStart).toBe(date(1, 1, 2027));
    expect(list.monthStrip[30]).toMatchObject({ isToday: true, outgoingAmount: 100 });
  });

  it('starts later-this-month on day seven, includes month end, and excludes next month from totals', () => {
    const list = build(
      {
        items: [payment('plan', { status: PlannedPaymentStatus.COMPLETED })],
        savedOccurrences: [
          saved('today', 'plan', date(10, 3)),
          saved('six', 'plan', date(10, 9, 2026, 23)),
          saved('seven', 'plan', date(10, 10)),
          saved('end', 'plan', date(10, 31, 2026, 23)),
          saved('next', 'plan', date(11, 1)),
        ],
      },
      date(10, 3, 2026, 23),
    );
    expect(list.groups[1].rows).toHaveLength(2);
    expect(list.groups[2].rows).toHaveLength(2);
    expect(list.groups[3].rows).toHaveLength(1);
    expect(list.summary.outgoing.count).toBe(4);
  });

  it('uses leap February and finite end boundaries with raw numeric strip amounts', () => {
    const list = build(
      {
        items: [
          payment('leap', {
            startDate: date(1, 31, 2028),
            nextOccurrence: date(1, 31, 2028),
            recurrenceDay: 31,
            endDate: date(2, 29, 2028),
          }),
        ],
        savedOccurrences: [],
      },
      date(2, 29, 2028),
    );
    expect(list.monthStrip).toHaveLength(29);
    expect(list.summary.outgoing.count).toBe(2);
    expect(list.monthStrip[28]).toMatchObject({
      outgoingAmount: 100,
      incomingAmount: 0,
      isToday: true,
    });
    expect(list.groups[3].rows).toEqual([]);
    expect(
      list.monthStrip.every(
        day => typeof day.outgoingAmount === 'number' && typeof day.incomingAmount === 'number',
      ),
    ).toBe(true);
  });

  it('returns zero totals and complete calendar cells for an empty list', () => {
    const list = build({ items: [], savedOccurrences: [] }, date(2, 1));
    expect(list.summary.outgoing).toMatchObject({
      perCurrency: [],
      count: 0,
      mainCurrency: { amount: 0, currencyCode: 'USD' },
    });
    expect(list.groups.every(group => group.rows.length === 0)).toBe(true);
    expect(list.monthStrip).toHaveLength(28);
  });
});
