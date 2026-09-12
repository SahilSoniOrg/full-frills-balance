/**
 * The accounting period used by every Reports V2 query.
 *
 * Dates are epoch milliseconds. Both bounds are inclusive and are interpreted
 * in `timeZone`; the reader is responsible for translating them to storage
 * predicates without changing the user's selected calendar days.
 */
export interface ReportPeriod {
  readonly startDate: number;
  readonly endDate: number;
  readonly timeZone: string;
}

export const REPORT_BASES = {
  ACTUAL: 'ACTUAL',
  ACTUAL_PLUS_PLANNED: 'ACTUAL_PLUS_PLANNED',
} as const;

export type ReportBasis = (typeof REPORT_BASES)[keyof typeof REPORT_BASES];

export const REPORT_COMPARISONS = {
  NONE: 'NONE',
  PREVIOUS_PERIOD: 'PREVIOUS_PERIOD',
  PREVIOUS_YEAR: 'PREVIOUS_YEAR',
} as const;

export type ReportComparison = (typeof REPORT_COMPARISONS)[keyof typeof REPORT_COMPARISONS];

export const REPORT_GRANULARITIES = {
  AUTO: 'AUTO',
  DAY: 'DAY',
  WEEK: 'WEEK',
  MONTH: 'MONTH',
} as const;

export type ReportGranularity = (typeof REPORT_GRANULARITIES)[keyof typeof REPORT_GRANULARITIES];

/** A resolved comparison period. `NONE` has no comparison period. */
export interface ReportComparisonPeriod {
  readonly comparison: Exclude<ReportComparison, 'NONE'>;
  readonly period: ReportPeriod;
}
