import type { ReportsV2Comparison, ReportsV2PeriodPreset, ReportsV2SectionId } from './types';

export const REPORTS_V2_SECTIONS: readonly {
  id: ReportsV2SectionId;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview' },
  { id: 'cash-flow', label: 'Cash flow', shortLabel: 'Cash flow' },
  { id: 'spending', label: 'Spending', shortLabel: 'Spending' },
  { id: 'income', label: 'Income', shortLabel: 'Income' },
  { id: 'net-worth', label: 'Net worth', shortLabel: 'Net worth' },
  { id: 'budgets', label: 'Budgets', shortLabel: 'Budgets' },
  { id: 'debt', label: 'Debt', shortLabel: 'Debt' },
  { id: 'forecast', label: 'Forecast', shortLabel: 'Forecast' },
  { id: 'health', label: 'Report health', shortLabel: 'Health' },
];

export const REPORTS_V2_PERIODS: readonly {
  id: ReportsV2PeriodPreset;
  label: string;
}[] = [
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'year', label: 'Year to date' },
  { id: 'all-time', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];

export const REPORTS_V2_COMPARISONS: readonly {
  id: ReportsV2Comparison;
  label: string;
}[] = [
  { id: 'NONE', label: 'No comparison' },
  { id: 'PREVIOUS_PERIOD', label: 'Previous period' },
  { id: 'PREVIOUS_YEAR', label: 'Same period last year' },
];

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function periodRangeForPreset(
  preset: ReportsV2PeriodPreset,
  now = new Date(),
): { startDate: number; endDate: number } {
  const current = startOfDay(now);

  switch (preset) {
    case 'quarter': {
      const quarterStartMonth = Math.floor(current.getMonth() / 3) * 3;
      return {
        startDate: new Date(current.getFullYear(), quarterStartMonth, 1).getTime(),
        endDate: endOfDay(current).getTime(),
      };
    }
    case 'year':
      return {
        startDate: new Date(current.getFullYear(), 0, 1).getTime(),
        endDate: endOfDay(current).getTime(),
      };
    case 'all-time':
      return { startDate: 0, endDate: endOfDay(current).getTime() };
    case 'custom':
    case 'month':
    default:
      return {
        startDate: new Date(current.getFullYear(), current.getMonth(), 1).getTime(),
        endDate: endOfDay(current).getTime(),
      };
  }
}

export function formatPeriodLabel(
  startDate: number,
  endDate: number,
  preset?: ReportsV2PeriodPreset,
): string {
  if (preset) {
    const match = REPORTS_V2_PERIODS.find(period => period.id === preset);
    if (match && preset !== 'custom') return match.label;
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${formatter.format(new Date(startDate))} – ${formatter.format(new Date(endDate))}`;
}

export function comparisonLabel(comparison: ReportsV2Comparison): string {
  return REPORTS_V2_COMPARISONS.find(item => item.id === comparison)?.label ?? 'No comparison';
}

export function formatDelta(delta: number | undefined): string | null {
  if (delta === undefined || !Number.isFinite(delta)) return null;
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function formatCount(count: number | undefined): string | null {
  if (count === undefined || !Number.isFinite(count)) return null;
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}
