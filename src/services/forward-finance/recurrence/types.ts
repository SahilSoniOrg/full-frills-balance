export type RecurrenceInterval = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  intervalType: RecurrenceInterval | string;
  intervalN: number;
  startDate?: number;
  endDate?: number;
  recurrenceDay?: number; // Day of month (1-31) or Day of week (0-6)
  recurrenceMonth?: number; // Month index (1-12) for yearly
  createdAt?: Date | number;
}

export interface DateRange {
  startDate: number;
  endDate: number;
}
