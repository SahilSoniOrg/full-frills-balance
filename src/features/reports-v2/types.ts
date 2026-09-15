import type { AccountType } from '@/src/types/enums';
import type {
  ReportDrilldownQuery,
  ReportQuery,
  ReportSectionId,
} from '@/src/services/reports-v2/types/query';
import type { ReportResult } from '@/src/services/reports-v2/types/result';
import type { ReportsV2QueryEngine } from '@/src/services/reports-v2/reportQueryEngine';

export type ReportsV2SectionId = ReportSectionId;
export type ReportsV2PeriodPreset = 'month' | 'quarter' | 'year' | 'all-time' | 'custom';
export type ReportsV2Basis = 'ACTUAL' | 'ACTUAL_PLUS_PLANNED';
export type ReportsV2Comparison = 'NONE' | 'PREVIOUS_PERIOD' | 'PREVIOUS_YEAR';
export type ReportsV2Granularity = 'AUTO' | 'DAY' | 'WEEK' | 'MONTH';
export type ReportsV2LoadState = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';
export type ReportsV2Query = ReportQuery;
export type ReportsV2Result = ReportResult;
export type ReportsV2DrilldownQuery = ReportDrilldownQuery;

export interface ReportsV2FiltersViewModel {
  periodPreset: ReportsV2PeriodPreset;
  periodLabel: string;
  basis: ReportsV2Basis;
  comparison: ReportsV2Comparison;
  granularity: ReportsV2Granularity;
  targetCurrency: string;
  accountIds: readonly string[];
  onAccountIdsChange: (accountIds: readonly string[]) => void;
  accountScopeLabel: string;
  onPeriodPresetChange: (preset: ReportsV2PeriodPreset) => void;
  onBasisChange: (basis: ReportsV2Basis) => void;
  onComparisonChange: (comparison: ReportsV2Comparison) => void;
  onGranularityChange: (granularity: ReportsV2Granularity) => void;
  onRequestCustomRange?: () => void;
  onRequestAccountScope?: () => void;
  onRequestCurrency?: () => void;
}

export interface ReportsV2DrilldownInput {
  label: string;
  accountIds?: readonly string[];
  accountTypes?: readonly AccountType[];
  accountSubtypes?: readonly string[];
  journalIds?: readonly string[];
  semanticTypes?: readonly string[];
  flowClassifications?: readonly (
    | 'INCOME'
    | 'EXPENSE'
    | 'REFUND'
    | 'TRANSFER'
    | 'BORROWING'
    | 'DEBT_PAYMENT'
    | 'EQUITY'
    | 'UNKNOWN'
  )[];
  startDate?: number;
  endDate?: number;
}

export interface ReportsV2ViewModel {
  query: ReportsV2Query;
  filters: ReportsV2FiltersViewModel;
  activeSection: ReportsV2SectionId;
  setActiveSection: (section: ReportsV2SectionId) => void;
  state: ReportsV2LoadState;
  result: ReportsV2Result | null;
  renderedSection: ReportsV2Result['sections'][number] | null;
  error: Error | null;
  onRefresh: () => void;
  onRetry: () => void;
  onDrilldown: (input: ReportsV2DrilldownInput) => void;
  onRequestCustomRange?: () => void;
  onRequestAccountScope?: () => void;
  onRequestCurrency?: () => void;
}

export type ReportsV2Engine = ReportsV2QueryEngine;
