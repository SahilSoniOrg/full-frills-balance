import { AppCard, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import type { SafeToSpendProjection } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendBreakdownMetrics } from './SafeToSpendBreakdownMetrics';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendCardLayout } from './SafeToSpendCardLayout';
import { SafeToSpendHeader } from './SafeToSpendHeader';
import {
  safeToSpendAmountTone,
  safeToSpendNotices,
} from '@/src/features/dashboard/safeToSpendNotices';

export interface SafeToSpendCardProps {
  projection: SafeToSpendProjection;
  isLoading?: boolean;
  detailsReady?: boolean;
  onInfoPress: () => void;
  onLegendPress: (i: 'safe' | 'committed' | 'debts' | null) => void;
  viewModel: SafeToSpendViewModel;
  /** When false, hides the projection chart; amount and breakdown stay. Default true. */
  showChart?: boolean;
}

export const SafeToSpendCard = (props: SafeToSpendCardProps) => {
  const {
    viewModel,
    projection,
    isLoading,
    detailsReady = true,
    onInfoPress,
    onLegendPress,
    showChart = true,
  } = props;
  const {
    isOverCommitted,
    isPositiveSafeToSpend,
    committedTotal,
    effectiveTotal,
    safeToSpend,
    shortfall,
    committedLiabilities,
    currencyCode,
    isLoading: vmLoading,
  } = viewModel;
  const quality = viewModel.quality ?? 'ready';
  const notices = safeToSpendNotices({
    quality,
    staleReason: viewModel.staleReason,
    latestActiveJournalAt: viewModel.latestActiveJournalAt,
  });
  const amountTone = safeToSpendAmountTone({
    isOverCommitted,
    isPositiveSafeToSpend,
    quality,
    latestActiveJournalAt: viewModel.latestActiveJournalAt,
    incomplete: Boolean(viewModel.hasUnvaluedEntries),
  });

  const loading = isLoading ?? vmLoading;
  const hasBreakdownData = effectiveTotal > 0;
  const projectionValues = [...projection.history, ...projection.projection].map(p => p.value);
  // A flat line (no entries yet) has nothing to show: skip the chart and its Max/Available markers.
  const hasProjectionData = new Set(projectionValues).size > 1;
  const infoDisabled =
    !detailsReady && notices.length === 0 && !viewModel.hasUnvaluedEntries && quality !== 'stale';

  // In the shortfall state the bar is fully reserved and carries no information.
  const breakdown =
    hasBreakdownData && !isOverCommitted ? (
      <SafeToSpendBreakdownBar
        effectiveTotal={effectiveTotal}
        committedTotal={committedTotal}
        committedLiabilities={committedLiabilities}
        safeToSpend={safeToSpend}
      />
    ) : null;

  const metrics = hasBreakdownData ? (
    <SafeToSpendBreakdownMetrics
      committedTotal={committedTotal}
      committedLiabilities={committedLiabilities}
      currencyCode={currencyCode}
      loading={loading}
      detailsReady={detailsReady}
      onPress={onLegendPress}
    />
  ) : null;

  const chart =
    showChart && hasProjectionData ? (
      <SafeToSpendChart
        projection={projection}
        safeToSpend={safeToSpend}
        isOverCommitted={isOverCommitted}
        currencyCode={currencyCode}
        isLoading={loading}
      />
    ) : null;

  const header =
    quality === 'unavailable' ? (
      <AppText color="secondary">
        {AppConfig.strings.dashboard.safeToSpendUi.forecastUnavailable}
      </AppText>
    ) : (
      <SafeToSpendHeader
        isOverCommitted={isOverCommitted}
        amount={isOverCommitted ? shortfall : safeToSpend}
        incomplete={Boolean(viewModel.hasUnvaluedEntries)}
        tone={amountTone}
        currencyCode={currencyCode}
        loading={loading}
        infoDisabled={infoDisabled}
        forecastDays={viewModel.safeToSpendDays}
        onInfoPress={onInfoPress}
      />
    );

  return (
    <AppCard overflow="visible" elevation="none" background="transparent" paddingSize="none">
      <SafeToSpendCardLayout
        summary={header}
        breakdown={quality === 'unavailable' ? null : breakdown}
        metrics={quality === 'unavailable' ? null : metrics}
        chart={quality === 'unavailable' ? null : chart}
      />
    </AppCard>
  );
};
