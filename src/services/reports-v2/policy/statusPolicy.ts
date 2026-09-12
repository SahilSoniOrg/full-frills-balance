import { JournalStatus } from '@/src/types/enums';
import type { ReportBasis } from '../types/period';

export const ACTUAL_JOURNAL_STATUSES = [JournalStatus.POSTED] as const;
export const FORECAST_JOURNAL_STATUSES = [JournalStatus.PLANNED] as const;

export type ReportJournalDisposition = 'ACTUAL' | 'FORECAST' | 'EXCLUDED';

export interface JournalStatusPolicy {
  readonly basis: ReportBasis;
  readonly actualStatuses: readonly JournalStatus[];
  readonly forecastStatuses: readonly JournalStatus[];
  readonly excludedStatuses: readonly JournalStatus[];
  readonly classify: (status: JournalStatus) => ReportJournalDisposition;
  readonly includes: (status: JournalStatus) => boolean;
  readonly isForecast: (status: JournalStatus) => boolean;
}

/**
 * V2 deliberately treats only POSTED journals as historical actuals. A
 * reversing journal is posted, while the original journal is marked REVERSED;
 * counting REVERSED as active would double-count that economic event.
 */
export function createJournalStatusPolicy(basis: ReportBasis): JournalStatusPolicy {
  const actualStatuses: readonly JournalStatus[] = ACTUAL_JOURNAL_STATUSES;
  const forecastStatuses: readonly JournalStatus[] =
    basis === 'ACTUAL_PLUS_PLANNED' ? FORECAST_JOURNAL_STATUSES : [];
  const excludedStatuses: readonly JournalStatus[] = Object.values(JournalStatus).filter(
    status => !actualStatuses.includes(status) && !forecastStatuses.includes(status),
  );

  const classify = (status: JournalStatus): ReportJournalDisposition => {
    if (actualStatuses.includes(status)) return 'ACTUAL';
    if (forecastStatuses.includes(status)) return 'FORECAST';
    return 'EXCLUDED';
  };

  return {
    basis,
    actualStatuses,
    forecastStatuses,
    excludedStatuses,
    classify,
    includes: status => classify(status) !== 'EXCLUDED',
    isForecast: status => classify(status) === 'FORECAST',
  };
}

export const ACTUAL_STATUS_POLICY = createJournalStatusPolicy('ACTUAL');
export const ACTUAL_PLUS_PLANNED_STATUS_POLICY = createJournalStatusPolicy('ACTUAL_PLUS_PLANNED');
