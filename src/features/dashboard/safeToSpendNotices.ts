import { AppConfig } from '@/src/constants';
import { booksGapDays } from '@/src/services/simulation/booksFreshness';
import type { SafeToSpendStaleReason } from '@/src/services/simulation/safeToSpendDashboardProjection';

export type SafeToSpendAmountTone =
  'shortfall' | 'uncertain' | 'incomplete' | 'available' | 'neutral';

export interface SafeToSpendNotice {
  id: string;
  message: string;
}

function lowConfidenceAge(
  latestActiveJournalAt: number | null | undefined,
  now: number,
): number | null {
  const gap = booksGapDays(latestActiveJournalAt, now);
  if (gap === null || gap < AppConfig.defaults.safeToSpendLowConfidenceAfterDays) return null;
  return gap;
}

/** Sentences that tell the user this Safe to Spend figure may be wrong. */
export function safeToSpendNotices(input: {
  quality: 'ready' | 'stale' | 'unavailable';
  staleReason?: SafeToSpendStaleReason;
  latestActiveJournalAt?: number | null;
  now?: number;
}): SafeToSpendNotice[] {
  const notices: SafeToSpendNotice[] = [];
  const age =
    input.quality === 'unavailable'
      ? null
      : lowConfidenceAge(input.latestActiveJournalAt, input.now ?? Date.now());
  if (age !== null) {
    notices.push({
      id: 'safe-to-spend-low-confidence',
      message: AppConfig.strings.dashboard.lowConfidenceWarning(age),
    });
  }
  if (input.quality === 'stale' && input.staleReason === 'failed') {
    notices.push({
      id: 'safe-to-spend-stale-warning',
      message: AppConfig.strings.dashboard.safeToSpendUi.forecastStale,
    });
  }
  if (input.quality === 'stale' && input.staleReason === 'saved') {
    notices.push({
      id: 'safe-to-spend-stale-warning',
      message: AppConfig.strings.dashboard.safeToSpendConstraint.staleNote,
    });
  }
  return notices;
}

/** One tone for the hero amount. Forecast staleness and old books share `uncertain`. */
export function safeToSpendAmountTone(input: {
  isOverCommitted: boolean;
  isPositiveSafeToSpend: boolean;
  quality: 'ready' | 'stale' | 'unavailable';
  latestActiveJournalAt?: number | null;
  now?: number;
  incomplete: boolean;
}): SafeToSpendAmountTone {
  if (input.isOverCommitted) return 'shortfall';
  if (
    input.quality === 'stale' ||
    lowConfidenceAge(input.latestActiveJournalAt, input.now ?? Date.now()) !== null
  )
    return 'uncertain';
  if (input.incomplete) return 'incomplete';
  if (input.isPositiveSafeToSpend) return 'available';
  return 'neutral';
}
