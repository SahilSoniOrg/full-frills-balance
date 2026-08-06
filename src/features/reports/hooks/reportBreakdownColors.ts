import { Theme } from '@/src/constants/design-tokens';
import { REPORT_CHART_COLOR_KEYS } from '@/src/constants/report-constants';

export function getReportChartPalettes(theme: Theme) {
  return {
    expense: REPORT_CHART_COLOR_KEYS.expense.map(colorKey => theme[colorKey]),
    income: REPORT_CHART_COLOR_KEYS.income.map(colorKey => theme[colorKey]),
  };
}

export function colorizeBreakdownItems<T extends object>(
  items: T[],
  palette: string[],
): (T & { color: string })[] {
  return items.map((item, index) => ({
    ...item,
    color: palette[index % palette.length],
  }));
}
