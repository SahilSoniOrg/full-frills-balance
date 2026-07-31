import { PlannedPaymentInterval } from '@/src/data/models/PlannedPayment';
import { formatPlannedPaymentInterval } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';

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
    ).toBe('Every 2 weeklys');
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
