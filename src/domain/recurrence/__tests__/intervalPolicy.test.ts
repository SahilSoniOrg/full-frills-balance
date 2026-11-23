import {
  approxIntervalDays,
  INTERVAL_POLICIES,
  INTERVAL_TYPES,
  resolveIntervalPolicy,
  scheduleFieldsForInterval,
} from '../intervalPolicy';

describe('intervalPolicy', () => {
  it('lists the four calendar intervals', () => {
    expect(INTERVAL_TYPES).toEqual(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
  });

  it('resolves known types and defaults unknowns to MONTHLY', () => {
    expect(resolveIntervalPolicy('WEEKLY').type).toBe('WEEKLY');
    expect(resolveIntervalPolicy(undefined).type).toBe('MONTHLY');
    expect(resolveIntervalPolicy('BIWEEKLY').type).toBe('MONTHLY');
  });

  it('exposes dayjs units and recurrence field flags', () => {
    expect(INTERVAL_POLICIES.DAILY).toMatchObject({
      unit: 'day',
      recurrenceDayKind: 'none',
      usesRecurrenceMonth: false,
    });
    expect(INTERVAL_POLICIES.WEEKLY).toMatchObject({
      unit: 'week',
      recurrenceDayKind: 'weekday',
      usesRecurrenceMonth: false,
    });
    expect(INTERVAL_POLICIES.MONTHLY).toMatchObject({
      unit: 'month',
      recurrenceDayKind: 'monthDay',
      usesRecurrenceMonth: false,
    });
    expect(INTERVAL_POLICIES.YEARLY).toMatchObject({
      unit: 'year',
      recurrenceDayKind: 'monthDay',
      usesRecurrenceMonth: true,
    });
  });

  it.each([
    ['DAILY', 1, 1],
    ['DAILY', 3, 3],
    ['WEEKLY', 1, 7],
    ['WEEKLY', 2, 14],
    ['MONTHLY', 1, 30],
    ['MONTHLY', 2, 60],
    ['YEARLY', 1, 365],
    ['YEARLY', 2, 730],
    [undefined, 0, 30],
  ] as const)('approxIntervalDays(%s, %s) → %s', (type, n, expected) => {
    expect(approxIntervalDays(type, n)).toBe(expected);
  });

  it('builds schedule field defaults from anchors', () => {
    const anchors = { weekday: 2, dayOfMonth: 15, month: 6 };
    expect(scheduleFieldsForInterval('DAILY', anchors)).toEqual({
      recurrenceDay: undefined,
      recurrenceMonth: undefined,
    });
    expect(scheduleFieldsForInterval('WEEKLY', anchors)).toEqual({
      recurrenceDay: 2,
      recurrenceMonth: undefined,
    });
    expect(scheduleFieldsForInterval('MONTHLY', anchors)).toEqual({
      recurrenceDay: 15,
      recurrenceMonth: undefined,
    });
    expect(scheduleFieldsForInterval('YEARLY', anchors)).toEqual({
      recurrenceDay: 15,
      recurrenceMonth: 6,
    });
  });
});
