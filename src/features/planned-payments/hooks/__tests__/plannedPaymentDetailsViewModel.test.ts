import {
  AuditAction,
  JournalStatus,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/enums';
import type { JournalId } from '@/src/types/ids';
import type { PlainAuditLog } from '@/src/types/plainDtos';
import {
  countRemainingPlannedOccurrences,
  findFirstRecordedDate,
  findPausedAtFromAudit,
} from '../plannedPaymentDetailsViewModelData';

const audit = (timestamp: number, before: string, after: string): PlainAuditLog => ({
  id: `${timestamp}`,
  entityType: 'planned_payment',
  entityId: 'plan',
  action: AuditAction.UPDATE,
  changes: JSON.stringify({
    eventType: 'planned_payment.status_changed',
    before: { status: before },
    after: { status: after },
  }),
  eventType: 'planned_payment.status_changed',
  timestamp,
  canRevert: false,
});

describe('planned payment detail view-model helpers', () => {
  it('uses the actual transition timestamp from audit data for pause context', () => {
    expect(
      findPausedAtFromAudit([
        audit(300, PlannedPaymentStatus.PAUSED, PlannedPaymentStatus.ACTIVE),
        audit(200, PlannedPaymentStatus.ACTIVE, PlannedPaymentStatus.PAUSED),
        audit(400, PlannedPaymentStatus.ACTIVE, PlannedPaymentStatus.PAUSED),
      ]),
    ).toBe(400);
    expect(findPausedAtFromAudit([])).toBeUndefined();
    expect(
      findPausedAtFromAudit([
        {
          ...audit(400, PlannedPaymentStatus.ACTIVE, PlannedPaymentStatus.PAUSED),
          changes: '{invalid',
        },
      ]),
    ).toBeUndefined();
  });

  it('counts finite future occurrences through the inclusive end date', () => {
    const monthly = {
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      recurrenceDay: 31,
    };
    const start = new Date(2026, 0, 31).getTime();
    const end = new Date(2026, 2, 31).getTime();
    expect(countRemainingPlannedOccurrences(start, end, monthly)).toBe(3);
    expect(countRemainingPlannedOccurrences(start, undefined, monthly)).toBeUndefined();
    expect(countRemainingPlannedOccurrences(Number.NaN, end, monthly)).toBe(0);
    expect(
      countRemainingPlannedOccurrences(start, new Date(2055, 0, 1).getTime(), {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.DAILY,
      }),
    ).toBeUndefined();
  });

  it('finds the earliest genuine recorded entry and skips reversals from totals context', () => {
    expect(
      findFirstRecordedDate([
        {
          status: JournalStatus.POSTED,
          journalDate: 400,
          originalJournalId: 'original' as JournalId,
        },
        { status: JournalStatus.REVERSED, journalDate: 200 },
        { status: JournalStatus.POSTED, journalDate: 300 },
        { status: JournalStatus.POSTED, journalDate: 100 },
      ]),
    ).toBe(100);
    expect(
      findFirstRecordedDate([
        {
          status: JournalStatus.POSTED,
          journalDate: 400,
          originalJournalId: 'original' as JournalId,
        },
      ]),
    ).toBeUndefined();
  });
});
