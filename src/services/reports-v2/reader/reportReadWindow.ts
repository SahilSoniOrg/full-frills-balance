import { resolveComparisonPeriod } from '../calculators/core/coreUtils';
import type { ReportPeriod } from '../types/period';
import type { ReportQuery } from '../types/query';

export function resolveEffectiveReportPeriod(
  period: ReportPeriod,
  earliestPostedDate: number | null,
): ReportPeriod {
  if (period.startDate > 0) return period;
  if (earliestPostedDate == null || !Number.isFinite(earliestPostedDate)) return period;
  return {
    ...period,
    startDate: Math.min(Math.max(0, earliestPostedDate), period.endDate),
  };
}

export function resolveFactReadWindow(
  query: Pick<ReportQuery, 'comparison'> & { comparisonPeriod?: ReportPeriod | null },
  period: ReportPeriod,
): ReportPeriod {
  const comparisonPeriod = resolveComparisonPeriod(query, period);
  if (!comparisonPeriod) return period;
  return {
    startDate: Math.min(period.startDate, comparisonPeriod.startDate),
    endDate: Math.max(period.endDate, comparisonPeriod.endDate),
    timeZone: period.timeZone,
  };
}
