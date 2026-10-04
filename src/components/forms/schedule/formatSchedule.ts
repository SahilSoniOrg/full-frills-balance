import { RecurrenceEngine } from '@/src/services/forward-finance/recurrence/RecurrenceEngine';
import { formPrimitivesStrings as copy } from '@/src/constants/copy/domains/formPrimitivesStrings';
import type { ScheduleValue } from './types';

export interface ScheduleSentencePart {
  text: string;
  emphasized: boolean;
}

const units = {
  DAILY: copy.dayUnit,
  WEEKLY: copy.weekUnit,
  MONTHLY: copy.monthUnit,
  YEARLY: copy.yearUnit,
} as const;
export function formatScheduleSentence(value: ScheduleValue): ScheduleSentencePart[] {
  const unit = units[value.intervalType];
  const intervalN = Number.isInteger(value.intervalN) && value.intervalN > 0 ? value.intervalN : 1;
  const parts: ScheduleSentencePart[] = [
    { text: copy.everyPrefix(intervalN), emphasized: false },
    { text: intervalN === 1 ? unit : `${unit}s`, emphasized: true },
  ];
  if (value.intervalType === 'YEARLY' && value.recurrenceMonth !== undefined) {
    parts.push(
      { text: copy.yearIn, emphasized: false },
      { text: copy.monthNames[value.recurrenceMonth - 1] ?? '', emphasized: true },
    );
  }
  if (value.intervalType === 'WEEKLY' && value.recurrenceDay !== undefined) {
    parts.push(
      { text: copy.on, emphasized: false },
      { text: copy.weekdayNames[value.recurrenceDay] ?? '', emphasized: true },
    );
  } else if (
    (value.intervalType === 'MONTHLY' || value.intervalType === 'YEARLY') &&
    value.recurrenceDay !== undefined
  ) {
    parts.push(
      { text: copy.onThe, emphasized: false },
      {
        text: value.recurrenceDay === 31 ? copy.lastDaySentence : copy.ordinal(value.recurrenceDay),
        emphasized: true,
      },
    );
  }
  return parts;
}

export function previewOccurrences(value: ScheduleValue, startDate: number, count = 3): number[] {
  if (
    !Number.isInteger(value.intervalN) ||
    value.intervalN < 1 ||
    !Number.isFinite(startDate) ||
    count <= 0
  )
    return [];
  const rule = { ...value, startDate };
  const result: number[] = [];
  let next = RecurrenceEngine.computeFirstOccurrence(startDate, rule);
  for (let index = 0; index < count; index += 1) {
    result.push(next);
    next = RecurrenceEngine.getNextOccurrence(next, rule);
  }
  return result;
}
