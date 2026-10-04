import {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
  JournalDisplayType,
} from '@/src/types/enums';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalId } from '@/src/types/ids';
import {
  formatPlannedPaymentInterval,
  presentPlannedPaymentDue,
  getPlannedPaymentHistoryPresentation,
  plannedMoneyDiffers,
} from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';

describe('formatPlannedPaymentInterval', () => {
  it('formats standard single intervals', () => {
    expect(
      formatPlannedPaymentInterval({
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
      }),
    ).toBe('Monthly');
  });

  it('adds weekly recurrence details', () => {
    expect(
      formatPlannedPaymentInterval({
        intervalN: 1,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 2,
      }),
    ).toBe('Weekly on Tue');
  });

  it('formats multi-interval and yearly details', () => {
    expect(
      formatPlannedPaymentInterval({
        intervalN: 2,
        intervalType: PlannedPaymentInterval.WEEKLY,
      }),
    ).toBe('Every 2 weeks');
    expect(
      formatPlannedPaymentInterval({
        intervalN: 1,
        intervalType: PlannedPaymentInterval.YEARLY,
        recurrenceMonth: 3,
        recurrenceDay: 15,
      }),
    ).toBe('Yearly on Mar day 15');
  });
});

describe('planned payment details context', () => {
  const now = new Date(2026, 9, 2, 23, 30).getTime();
  const entry = (id: string, status: string, day: number): EnrichedJournal => ({
    id: id as JournalId,
    status,
    journalDate: new Date(2026, 9, day).getTime(),
    totalAmount: 150,
    currencyCode: 'USD',
    transactionCount: 2,
    displayType: JournalDisplayType.EXPENSE,
    accounts: [],
  });

  it('uses calendar days for urgency and shows overdue completed obligations', () => {
    expect(
      presentPlannedPaymentDue(
        { status: PlannedPaymentStatus.ACTIVE, nextDueOccurrence: new Date(2026, 9, 3).getTime() },
        now,
      ).label,
    ).toBe('Due tomorrow');
    expect(
      presentPlannedPaymentDue(
        {
          status: PlannedPaymentStatus.COMPLETED,
          nextDueOccurrence: new Date(2026, 9, 1).getTime(),
        },
        now,
      ),
    ).toMatchObject({ label: '1 day late', color: 'error' });
  });

  it('distinguishes pausing from a completed schedule with no remaining obligation', () => {
    expect(presentPlannedPaymentDue({ status: PlannedPaymentStatus.PAUSED }, now)).toMatchObject({
      label: 'Paused',
      helpText: expect.stringContaining('paused'),
    });
    expect(presentPlannedPaymentDue({ status: PlannedPaymentStatus.COMPLETED }, now)).toMatchObject(
      { label: 'Ended', helpText: expect.stringContaining('Edit') },
    );
  });

  it('uses warning urgency for occurrences due within three calendar days', () => {
    expect(
      presentPlannedPaymentDue(
        {
          status: PlannedPaymentStatus.ACTIVE,
          nextDueOccurrence: new Date(2026, 9, 5).getTime(),
        },
        now,
      ),
    ).toMatchObject({ label: 'Due in 3 days', color: 'warning' });
    expect(
      presentPlannedPaymentDue(
        {
          status: PlannedPaymentStatus.ACTIVE,
          nextDueOccurrence: new Date(2026, 9, 6).getTime(),
        },
        now,
      ).color,
    ).toBe('secondary');
  });

  it('labels a future generated occurrence as waiting', () => {
    expect(
      getPlannedPaymentHistoryPresentation(entry('unpaid', 'PLANNED', 1), 150, 'USD'),
    ).toMatchObject({
      label: 'Waiting',
      subtitle: 'Waiting',
      color: 'secondary',
      isSkipped: false,
    });
  });

  it('reports planned-payment amount differences at the currency precision', () => {
    expect(plannedMoneyDiffers(100.001, 'USD', 100, 'USD')).toBe(false);
    expect(plannedMoneyDiffers(100.01, 'USD', 100, 'USD')).toBe(true);
    expect(plannedMoneyDiffers(100, 'JPY', 100.4, 'JPY')).toBe(false);
    expect(plannedMoneyDiffers(100, 'EUR', 100, 'USD')).toBe(true);
  });

  it('warns for a paid amount difference and avoids subtracting unlike currencies', () => {
    expect(
      getPlannedPaymentHistoryPresentation(entry('paid', 'POSTED', 1), 125, 'USD'),
    ).toMatchObject({
      differenceAmount: 25,
      differenceCurrencyCode: 'USD',
      differenceDirection: 'more',
      color: 'warning',
    });
    const foreign = { ...entry('foreign', 'POSTED', 1), currencyCode: 'EUR' };
    expect(getPlannedPaymentHistoryPresentation(foreign, 125, 'USD')).toMatchObject({
      subtitle: 'Paid in EUR; planned in another currency',
      color: 'warning',
      differenceAmount: undefined,
      expectedAmount: 125,
      expectedCurrencyCode: 'USD',
    });
  });

  it('uses skipped and reversed statuses without counting either as a paid difference', () => {
    expect(
      getPlannedPaymentHistoryPresentation(entry('skip', 'SKIPPED', 1), 125, 'USD'),
    ).toMatchObject({
      label: 'Skipped',
      subtitle: 'Skipped',
      isSkipped: true,
      differenceAmount: undefined,
    });
    expect(
      getPlannedPaymentHistoryPresentation(entry('reverse', 'REVERSED', 1), 125, 'USD'),
    ).toMatchObject({
      label: 'Reversed',
      subtitle: 'Reversed',
      differenceAmount: undefined,
    });
    expect(
      getPlannedPaymentHistoryPresentation(
        entry('reversal-journal', 'POSTED', 1),
        150,
        'USD',
        true,
      ),
    ).toMatchObject({
      label: 'Reversed',
      subtitle: 'Reversed',
      differenceAmount: undefined,
    });
  });
});
