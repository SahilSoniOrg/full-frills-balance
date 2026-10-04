import { AppConfig } from '@/src/constants/app-config';

const strings = AppConfig.strings.plannedPayments;

/** Keep schedule counts within the calendar's supported date range, including yearly rules. */
export function isValidRepeatCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 9999;
}

const UNITS: Record<string, { long: string; short: string; single: string }> = {
  DAILY: { long: 'day', short: 'day', single: strings.everyDay },
  WEEKLY: { long: 'week', short: 'wk', single: strings.everyWeek },
  MONTHLY: { long: 'month', short: 'mo', single: strings.everyMonth },
  YEARLY: { long: 'year', short: 'yr', single: strings.everyYear },
};

/** `long` reads "Monthly" / "Every 2 months"; `short` is the compact list form "1 mo" / "2 wk". */
export function formatRecurrence(
  { intervalType = 'MONTHLY', intervalN = 1 }: { intervalType?: string; intervalN?: number },
  style: 'long' | 'short' = 'long',
): string {
  const unit = UNITS[intervalType] ?? UNITS.MONTHLY;
  const count = intervalN || 1;
  if (style === 'short') {
    return `${count} ${unit.short === 'day' && count !== 1 ? 'days' : unit.short}`;
  }
  return count === 1 ? unit.single : strings.everyN(count, unit.long);
}
