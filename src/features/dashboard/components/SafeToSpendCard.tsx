import { AppCard, AppText, Icon } from '@/src/components/core';
import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import type { SafeToSpendProjection } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
import { IncompleteFxWarning } from '@/src/components/shared/IncompleteFxWarning';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendBreakdownMetrics } from './SafeToSpendBreakdownMetrics';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendCardLayout } from './SafeToSpendCardLayout';
import { SafeToSpendHeader } from './SafeToSpendHeader';
import { SafeToSpendForecastDetails } from './SafeToSpendForecastDetails';
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
  const formatMoney = useMoneyFormat();
  const { workplaceId } = useWorkplace();
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
  const hasForecastIssue = quality !== 'ready' || Boolean(viewModel.hasUnvaluedEntries);

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
        infoDisabled={!detailsReady}
        forecastDays={viewModel.safeToSpendDays}
        onInfoPress={onInfoPress}
      />
    );

  return (
    <AppCard overflow="visible" elevation="none" background="transparent" paddingSize="none">
      <SafeToSpendCardLayout
        summary={header}
        warning={
          hasForecastIssue || notices.length > 0 ? (
            <>
              {notices.map(notice => (
                <NoticeBanner
                  key={notice.id}
                  testID={notice.id}
                  tone="warning"
                  icon={Icon.Alert}
                  message={notice.message}
                />
              ))}
              {/* Provenance explains stale or partial forecasts, not a missing rate. */}
              {quality !== 'ready' ? <SafeToSpendForecastDetails viewModel={viewModel} /> : null}
              {viewModel.hasUnvaluedEntries ? (
                <IncompleteFxWarning
                  testID="safe-to-spend-incomplete-warning"
                  message={AppConfig.strings.dashboard.safeToSpendUi.incompleteEstimateWarning}
                  onPress={() =>
                    showIncompleteFxDetails({
                      context: 'safe-to-spend',
                      workplaceId,
                      currencyCode,
                      unvaluedStartingBalances: (viewModel.unvaluedStartingBalances ?? []).map(
                        balance => ({
                          accountId: balance.accountId,
                          accountName: balance.accountName,
                          fromCurrency: balance.fromCurrency,
                          toCurrency: balance.toCurrency,
                          amountLabel: formatMoney(balance.amount, balance.fromCurrency),
                        }),
                      ),
                    })
                  }
                />
              ) : null}
            </>
          ) : null
        }
        breakdown={quality === 'unavailable' ? null : breakdown}
        metrics={quality === 'unavailable' ? null : metrics}
        chart={quality === 'unavailable' ? null : chart}
      />
    </AppCard>
  );
};
