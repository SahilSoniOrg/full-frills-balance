import type { AccountId, JournalId } from '@/src/types/ids';
import type { ReportQuery } from './query';
import type { ReportPeriod } from './period';
import type { CountMeasure, MoneyMeasure, PercentageMeasure, ReportMeasure } from './measure';

export const REPORT_KINDS = {
  OVERVIEW: 'OVERVIEW',
  CASH_FLOW: 'CASH_FLOW',
  SPENDING: 'SPENDING',
  INCOME: 'INCOME',
  NET_WORTH: 'NET_WORTH',
  BUDGET: 'BUDGET',
  DEBT: 'DEBT',
  FORECAST: 'FORECAST',
  HEALTH: 'HEALTH',
} as const;

export type ReportKind = (typeof REPORT_KINDS)[keyof typeof REPORT_KINDS];

export type ReportWarningCode =
  | 'UNBALANCED_JOURNAL'
  | 'MISSING_ACCOUNT'
  | 'UNCATEGORIZED_ACTIVITY'
  | 'MISSING_EXCHANGE_RATE'
  | 'DUPLICATE_REVERSAL_ACTIVITY'
  | 'ARCHIVED_ACCOUNT_ACTIVITY'
  | 'UNSUPPORTED_ACCOUNT_SUBTYPE'
  | 'STALE_BALANCE_PROJECTION'
  | 'INVALID_AMOUNT'
  | 'PLANNED_IN_ACTUALS';

export interface ReportWarning {
  readonly code: ReportWarningCode;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
  readonly count?: number;
  readonly journalIds?: readonly JournalId[];
  readonly accountIds?: readonly AccountId[];
  readonly missingRateQuotes?: readonly MissingRateQuote[];
}

export type MissingRateQuote = {
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly rateDate: number;
};

export interface ReportComparisonDelta {
  readonly absolute?: ReportMeasure;
  readonly percentageChange?: number | null;
}

export interface ReportMetric {
  readonly id: string;
  readonly label: string;
  readonly value: ReportMeasure;
  readonly comparison?: ReportComparisonDelta;
}

export interface ReportPoint {
  readonly date: number;
  readonly value: MoneyMeasure;
}

export interface ReportSeries {
  readonly id: string;
  readonly label: string;
  readonly points: readonly ReportPoint[];
}

export type ReportVisualization =
  | {
      readonly kind: 'LINE' | 'BAR' | 'STACKED_BAR';
      readonly series: readonly ReportSeries[];
    }
  | {
      readonly kind: 'WATERFALL';
      readonly opening: MoneyMeasure;
      readonly changes: readonly ReportMetric[];
      readonly closing: MoneyMeasure;
    };

export interface ReportBreakdownRow {
  readonly id: string;
  readonly label: string;
  readonly value: MoneyMeasure | CountMeasure;
  readonly percentage?: PercentageMeasure;
  readonly accountIds?: readonly AccountId[];
  readonly journalIds?: readonly JournalId[];
}

export interface ReportSection {
  readonly id: string;
  readonly title: string;
  readonly metrics?: readonly ReportMetric[];
  readonly visualizations?: readonly ReportVisualization[];
  readonly rows?: readonly ReportBreakdownRow[];
}

/**
 * Chart-neutral result envelope. Specific calculators can narrow `kind` while
 * retaining one stable transport shape for the V2 UI.
 */
export interface ReportResult<K extends ReportKind = ReportKind> {
  readonly kind: K;
  readonly query: ReportQuery;
  readonly period: ReportPeriod;
  readonly comparisonPeriod?: ReportPeriod;
  readonly generatedAt: number;
  readonly measures: Readonly<Record<string, ReportMeasure>>;
  readonly sections: readonly ReportSection[];
  readonly warnings: readonly ReportWarning[];
}
