import { Dayjs } from 'dayjs';

/**
 * Calculates the next due date for a liability based on the current date and the configured due day.
 */
export function getNextDueDate(now: Dayjs, dueDay: number): Dayjs {
  let date = now.date(dueDay).startOf('day');
  if (date.isBefore(now, 'day')) {
    date = date.add(1, 'month');
  }
  return date;
}

/**
 * Calculates the statement date that corresponds to a given due date.
 * If the due day is less than or equal to the statement day, the statement
 * belongs to the previous month's cycle.
 */
export function getCorrespondingStatementDate(
  dueDate: Dayjs,
  statementDay: number,
  dueDay: number,
): Dayjs {
  let sDate = dueDate.date(statementDay).startOf('day');
  if (dueDay <= statementDay) {
    sDate = sDate.subtract(1, 'month');
  }
  return sDate;
}
