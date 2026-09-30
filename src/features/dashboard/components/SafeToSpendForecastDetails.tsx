import { AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { formatDate } from '@/src/utils/dateUtils';
import type { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';

type ForecastDetails = Pick<
  SafeToSpendViewModel,
  'asOf' | 'generatedAt' | 'snapshotAgeMs' | 'safeToSpendDays'
>;

export function SafeToSpendForecastDetails({ viewModel }: { viewModel: ForecastDetails }) {
  const { resolvedHourCycle } = useHourCyclePrefs();
  const provenance = AppConfig.strings.dashboard.safeToSpendProvenance;
  const { asOf, generatedAt, snapshotAgeMs, safeToSpendDays } = viewModel;

  return (
    <>
      {asOf !== undefined ? (
        <AppText variant="caption" color="secondary">
          {provenance.basedOn(
            formatDate(asOf),
            safeToSpendDays,
            generatedAt !== undefined
              ? formatDate(generatedAt, { includeTime: true, hourCycle: resolvedHourCycle })
              : undefined,
          )}
        </AppText>
      ) : null}
      {snapshotAgeMs !== undefined ? (
        <AppText variant="caption" color="secondary">
          {snapshotAgeMs < 60_000
            ? provenance.savedLessThanMinuteAgo
            : provenance.savedAgo(
                Math.floor(snapshotAgeMs / 3_600_000),
                Math.floor((snapshotAgeMs % 3_600_000) / 60_000),
              )}
        </AppText>
      ) : null}
    </>
  );
}
