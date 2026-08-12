import { Theme } from '@/src/constants/design-tokens';
import { REPORT_CHART_COLOR_KEYS } from '@/src/constants/report-constants';

export function getReportChartPalettes(theme: Theme) {
  return {
    expense: REPORT_CHART_COLOR_KEYS.expense.map(colorKey => theme[colorKey]),
    income: REPORT_CHART_COLOR_KEYS.income.map(colorKey => theme[colorKey]),
  };
}

/**
 * Assigns chart breakdown colors to items. Preserves explicit item `color`
 * (e.g., custom per-account accent) when present, otherwise falls back to sequential palette colors.
 */
export function colorizeBreakdownItems<T extends { color?: string }>(
  items: readonly T[],
  palette: readonly string[],
): (T & { color: string })[] {
  return items.map((item, index) => ({
    ...item,
    color: item.color || palette[index % palette.length],
  }));
}
