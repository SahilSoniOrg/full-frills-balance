import {
  presentAccountPeriod,
  presentAccountPeriodRange,
  previousComparableRange,
} from '@/src/features/accounts/helpers/accountPeriodPresentation';
import { AppConfig } from '@/src/constants';
import { AccountType } from '@/src/types/enums';
import dayjs from 'dayjs';

const metrics = (
  totalIncrease: number,
  totalDecrease: number,
  dailyAverage: number | null = 10,
) => ({
  totalIncrease,
  totalDecrease,
  dailyAverage,
});

describe('presentAccountPeriod', () => {
  it('shows asset growth with readable in and out totals', () => {
    const period = presentAccountPeriod({
      accountType: AccountType.ASSET,
      metrics: metrics(1000, 250),
      isPrivate: false,
    });

    expect(period.heroAmount).toBe(750);
    expect(period.heroSign).toBe('+');
    expect(period.badge).toEqual({ label: 'Growing', variant: 'success' });
    expect(period.bar).toBeNull();
    expect(period.stats.map(stat => stat.label)).toEqual(['In', 'Out']);
  });

  it('flags an asset spending more than came in', () => {
    const period = presentAccountPeriod({
      accountType: AccountType.ASSET,
      metrics: metrics(1000, 1500, -16),
      isPrivate: false,
      previous: { label: 'Sep, same day', netChange: -300 },
    });

    expect(period.heroSign).toBe('−');
    expect(period.badge?.label).toBe('Drawing down');
    expect(period.bar).toBeNull();
    expect(period.stats.map(stat => stat.label)).toEqual(['In', 'Out']);
    expect(period.comparison).toEqual({ label: 'Sep, same day', amount: 300, sign: '−' });
  });

  it('signs a category comparison only when it went negative', () => {
    const present = (netChange: number) =>
      presentAccountPeriod({
        accountType: AccountType.EXPENSE,
        metrics: metrics(500, 0),
        isPrivate: false,
        previous: { label: 'Sep total', netChange },
      }).comparison;

    expect(present(400)).toEqual({ label: 'Sep total', amount: 400, sign: undefined });
    expect(present(-50)).toEqual({ label: 'Sep total', amount: 50, sign: '−' });
  });

  it('hides liability repayment ratios in privacy mode', () => {
    const period = presentAccountPeriod({
      accountType: AccountType.LIABILITY,
      metrics: metrics(1000, 250),
      isPrivate: true,
    });

    expect(period.bar).toBeNull();
  });

  it('describes a credit card by charges and payments', () => {
    const period = presentAccountPeriod({
      accountType: AccountType.LIABILITY,
      metrics: metrics(2000, 3000),
      isPrivate: false,
    });

    expect(period.badge).toEqual({ label: 'Paid down', variant: 'success' });
    expect(period.bar).toMatchObject({ progress: 100, caption: 'Paid 150% of new charges' });
    expect(period.stats.map(stat => stat.label)).toEqual(['Charged', 'Paid']);
  });

  it('leads an expense category with what was spent and skips refunds when there are none', () => {
    const period = presentAccountPeriod({
      accountType: AccountType.EXPENSE,
      metrics: metrics(1354, 0),
      isPrivate: false,
    });

    expect(period.heroLabel).toBe('Spent');
    expect(period.heroAmount).toBe(1354);
    expect(period.bar).toBeNull();
    expect(period.stats.map(stat => stat.label)).toEqual(['Per day']);
  });

  it('marks a period with no entries as empty', () => {
    const period = presentAccountPeriod({
      accountType: AccountType.ASSET,
      metrics: metrics(0, 0, 0),
      isPrivate: false,
    });

    expect(period.isEmpty).toBe(true);
    expect(period.badge).toBeNull();
    expect(period.bar).toBeNull();
  });
});

describe('previousComparableRange', () => {
  const october = {
    startDate: dayjs('2026-10-01').valueOf(),
    endDate: dayjs('2026-10-31').endOf('day').valueOf(),
  };

  it('compares a running month with last month up to the same day', () => {
    const previous = previousComparableRange(october, dayjs('2026-10-08T12:00').valueOf());

    expect(previous).toEqual({
      startDate: dayjs('2026-09-01').valueOf(),
      endDate: dayjs('2026-09-08').endOf('day').valueOf(),
      label: 'Sep, same day',
    });
  });

  it('compares a finished month with the whole month before', () => {
    const previous = previousComparableRange(october, dayjs('2026-11-15').valueOf());

    expect(previous).toEqual({
      startDate: dayjs('2026-09-01').valueOf(),
      endDate: dayjs('2026-09-30').endOf('day').valueOf(),
      label: 'Sep total',
    });
  });

  it('cuts a running custom period at the end of the same day', () => {
    const range = {
      startDate: dayjs('2026-10-05').valueOf(),
      endDate: dayjs('2026-10-14').endOf('day').valueOf(),
    };

    expect(previousComparableRange(range, dayjs('2026-10-07').valueOf())).toEqual({
      startDate: dayjs('2026-09-25').valueOf(),
      endDate: dayjs('2026-09-27').endOf('day').valueOf(),
      label: 'Last period, same point',
    });
  });

  it('has nothing to compare for all time', () => {
    expect(previousComparableRange(null, Date.now())).toBeNull();
  });
});

describe('presentAccountPeriodRange', () => {
  it('counts days left in the current period', () => {
    const range = {
      startDate: dayjs('2026-10-01').valueOf(),
      endDate: dayjs('2026-10-31').endOf('day').valueOf(),
      label: 'Oct 2026',
    };

    const presented = presentAccountPeriodRange(range, dayjs('2026-10-08T12:00').valueOf());
    expect(presented.label).toBe('Oct 2026');
    expect(presented.isCurrent).toBe(true);
    expect(presented.period).toMatchObject({
      dateRangeText: '1 Oct 2026 – 31 Oct 2026',
      daysRemaining: 24,
    });
  });

  it('marks past periods as not current and labels all time', () => {
    const range = {
      startDate: dayjs('2026-09-01').valueOf(),
      endDate: dayjs('2026-09-30').endOf('day').valueOf(),
    };

    expect(presentAccountPeriodRange(range, dayjs('2026-10-08').valueOf()).isCurrent).toBe(false);
    expect(presentAccountPeriodRange(null, Date.now())).toEqual({
      label: AppConfig.strings.common.allTime,
      isCurrent: false,
    });
  });

  it('shows a single day by its date alone while still knowing it is today', () => {
    const today = dayjs('2026-10-08').valueOf();
    const presented = presentAccountPeriodRange(
      { startDate: today, endDate: dayjs(today).endOf('day').valueOf() },
      today,
    );

    expect(presented).toEqual({ label: '8 Oct 2026', isCurrent: true });
  });
});
