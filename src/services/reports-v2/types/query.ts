import type { FlowClassification } from '@/src/services/reports-v2/classification/classificationTypes';
import type { AccountSubtype, AccountType, SemanticType } from '@/src/types/enums';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import type { ReportBasis, ReportComparison, ReportGranularity, ReportPeriod } from './period';

export const REPORT_SECTION_IDS = [
  'overview',
  'cash-flow',
  'spending',
  'income',
  'net-worth',
  'budgets',
  'debt',
  'forecast',
  'health',
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_IDS)[number];

export function requestedReportSections(query: ReportQuery): ReadonlySet<ReportSectionId> {
  return new Set(query.sections?.length ? query.sections : REPORT_SECTION_IDS);
}

/** The single shared context inherited by every V2 report section. */
export interface ReportQuery {
  readonly workplaceId: WorkplaceId;
  readonly period: ReportPeriod;
  readonly targetCurrency: string;
  readonly basis: ReportBasis;
  readonly comparison: ReportComparison;
  readonly granularity: ReportGranularity;
  /** Sections to calculate. Omit to preserve the complete report contract. */
  readonly sections?: readonly ReportSectionId[];
  readonly accountIds?: readonly AccountId[];
  readonly accountTypes?: readonly AccountType[];
  readonly includeArchivedAccounts?: boolean;
}

/**
 * A narrowing of a base report query. The base query remains authoritative for
 * workplace, currency, basis, and comparison; optional fields can only narrow
 * the date/account/journal set selected by a chart or table row.
 */
export interface ReportDrilldownQuery {
  readonly baseQuery: ReportQuery;
  readonly startDate?: number;
  readonly endDate?: number;
  readonly accountIds?: readonly AccountId[];
  readonly accountTypes?: readonly AccountType[];
  readonly accountSubtypes?: readonly AccountSubtype[];
  readonly journalIds?: readonly JournalId[];
  readonly semanticTypes?: readonly SemanticType[];
  readonly flowClassifications?: readonly FlowClassification[];
}
