import { formatScheduleSentence, previewOccurrences } from '../schedule/formatSchedule';
import type { ScheduleValue } from '../schedule/types';

describe('formatScheduleSentence', () => {
  it.each([
    ['DAILY', 'day'],
    ['WEEKLY', 'week'],
    ['MONTHLY', 'month'],
    ['YEARLY', 'year'],
  ] as const)('formats %s intervals', (intervalType, unit) => {
    expect(
      formatScheduleSentence({ intervalType, intervalN: 1 })
        .map(part => part.text)
        .join(''),
    ).toContain(unit);
  });

  it('formats repeated intervals and last day', () => {
    expect(
      formatScheduleSentence({ intervalType: 'MONTHLY', intervalN: 2, recurrenceDay: 31 }),
    ).toEqual([
      { text: 'Every 2 ', emphasized: false },
      { text: 'months', emphasized: true },
      { text: ' on the ', emphasized: false },
      { text: 'last day', emphasized: true },
    ]);
  });

  it('formats weekday names', () => {
    expect(
      formatScheduleSentence({ intervalType: 'WEEKLY', intervalN: 1, recurrenceDay: 5 }),
    ).toEqual([
      { text: 'Every ', emphasized: false },
      { text: 'week', emphasized: true },
      { text: ' on ', emphasized: false },
      { text: 'Friday', emphasized: true },
    ]);
  });
});

describe('previewOccurrences', () => {
  const date = (value: string) => new Date(`${value}T12:00:00`).getTime();

  it('clamps a monthly recurrence anchored on the 31st through February', () => {
    const value: ScheduleValue = {
      intervalType: 'MONTHLY',
      intervalN: 1,
      recurrenceDay: 31,
    };
    const results = previewOccurrences(value, date('2026-01-31'), 3);
    expect(results.map(timestamp => new Date(timestamp).getDate())).toEqual([31, 28, 31]);
    expect(results.map(timestamp => new Date(timestamp).getMonth())).toEqual([0, 1, 2]);
  });

  it('uses the selected weekday for weekly previews', () => {
    const value: ScheduleValue = {
      intervalType: 'WEEKLY',
      intervalN: 1,
      recurrenceDay: 1,
    };
    expect(
      previewOccurrences(value, date('2026-10-07')).map(timestamp => new Date(timestamp).getDay()),
    ).toEqual([1, 1, 1]);
  });

  it('returns no preview for an invalid repeat count', () => {
    expect(
      previewOccurrences({ intervalType: 'MONTHLY', intervalN: Number.NaN }, date('2026-01-31')),
    ).toEqual([]);
  });
});
