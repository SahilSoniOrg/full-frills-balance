import { getCalendars } from 'expo-localization';

export type HourCyclePreference = 'system' | '12-hour' | '24-hour';
export type ResolvedHourCycle = '12-hour' | '24-hour';
export type ClockMeridiem = 'AM' | 'PM';

export const HOUR_CYCLE_PREFERENCES: readonly HourCyclePreference[] = [
  'system',
  '12-hour',
  '24-hour',
];

export function isHourCyclePreference(value: unknown): value is HourCyclePreference {
  return value === 'system' || value === '12-hour' || value === '24-hour';
}

/** OS 24-hour clock. `null` when the platform does not report it. */
export function readSystemUses24HourClock(): boolean | null {
  const value = getCalendars()[0]?.uses24hourClock;
  if (value === true || value === false) return value;
  return null;
}

export function resolveHourCycle(
  preference: HourCyclePreference,
  uses24hourClock: boolean | null,
): ResolvedHourCycle {
  if (preference === '12-hour') return '12-hour';
  if (preference === '24-hour') return '24-hour';
  return uses24hourClock === true ? '24-hour' : '12-hour';
}

export function hour24To12(hour24: number): { hour12: number; meridiem: ClockMeridiem } {
  const meridiem: ClockMeridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, meridiem };
}

export function hour12To24(hour12: number, meridiem: ClockMeridiem): number {
  if (meridiem === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}
