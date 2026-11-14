import { AppConfig } from '@/src/constants/app-config';
import { PlannedPaymentInterval } from '@/src/types/enums';

const strings = AppConfig.strings.plannedPayments;

const UNITS: Record<PlannedPaymentInterval, { long: string; short: string; single: string }> = {
  [PlannedPaymentInterval.DAILY]: { long: 'day', short: 'day', single: strings.everyDay },
  [PlannedPaymentInterval.WEEKLY]: { long: 'week', short: 'wk', single: strings.everyWeek },
  [PlannedPaymentInterval.MONTHLY]: { long: 'month', short: 'mo', single: strings.everyMonth },
  [PlannedPaymentInterval.YEARLY]: { long: 'year', short: 'yr', single: strings.everyYear },
};

/** `long` reads "Monthly" / "Every 2 months"; `short` is the compact list form "1 mo" / "2 wk". */
export function formatRecurrence(
  { intervalType = 'MONTHLY', intervalN = 1 }: { intervalType?: string; intervalN?: number },
  style: 'long' | 'short' = 'long',
): string {
  const unit =
    UNITS[intervalType as PlannedPaymentInterval] ?? UNITS[PlannedPaymentInterval.MONTHLY];
  const count = intervalN || 1;
  if (style === 'short') {
    return `${count} ${unit.short === 'day' && count !== 1 ? 'days' : unit.short}`;
  }
  return count === 1 ? unit.single : strings.everyN(count, unit.long);
}
