import type { RecurrenceInterval } from '@/src/services/forward-finance/recurrence/types';

export interface ScheduleValue {
  intervalType: RecurrenceInterval;
  intervalN: number;
  recurrenceDay?: number;
  recurrenceMonth?: number;
}
