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
  groupPlannedPaymentEntries,
  getPlannedPaymentHistoryPresentation,
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
    ).toMatchObject({ label: '1 day overdue', color: 'error' });
  });

  it('distinguishes pausing from a completed schedule with no remaining obligation', () => {
    expect(presentPlannedPaymentDue({ status: PlannedPaymentStatus.PAUSED }, now)).toMatchObject({
      label: 'Paused',
      helpText: expect.stringContaining('Resume'),
    });
    expect(presentPlannedPaymentDue({ status: PlannedPaymentStatus.COMPLETED }, now)).toMatchObject(
      { label: 'Completed', helpText: expect.stringContaining('Edit') },
    );
  });

  it('separates pending entries from recorded history and sorts both in useful order', () => {
    const history = [
      entry('later', 'PLANNED', 9),
      entry('posted', 'POSTED', 1),
      entry('paused', 'PAUSED', 6),
      entry('skipped', 'SKIPPED', 2),
    ];
    const sections = groupPlannedPaymentEntries(history);
    expect(sections.scheduled.map(item => item.id)).toEqual(['paused', 'later']);
    expect(sections.recorded.map(item => item.id)).toEqual(['skipped', 'posted']);
    expect(history[0].id).toBe('later');
  });

  it('labels an overdue occurrence explicitly rather than merely changing its color', () => {
    expect(getPlannedPaymentHistoryPresentation(entry('unpaid', 'PLANNED', 1), now)).toMatchObject({
      label: 'Overdue',
      isOverdue: true,
      typeColor: 'error',
    });
  });
});
