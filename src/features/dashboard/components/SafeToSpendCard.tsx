import { AppSurface, AppText } from '@/src/components/core';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppConfig } from '@/src/constants';
import type { SafeToSpendProjection } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
import { IncompleteFxWarning } from '@/src/components/shared/IncompleteFxWarning';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendBreakdownMetrics } from './SafeToSpendBreakdownMetrics';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendCardLayout } from './SafeToSpendCardLayout';
import { SafeToSpendHeader } from './SafeToSpendHeader';
import dayjs from 'dayjs';

export interface SafeToSpendCardProps {
  projection: SafeToSpendProjection;
  isLoading?: boolean;
  detailsReady?: boolean;
  onInfoPress: () => void;
  onLegendPress: (i: 'safe' | 'committed' | 'debts' | null) => void;
  viewModel: SafeToSpendViewModel;
  /** When false, hides the projection chart; amount and breakdown stay. Default true. */
  showChart?: boolean;
  quality?: 'ready' | 'stale' | 'unavailable';
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
    quality = 'ready',
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

  const loading = isLoading ?? vmLoading;
  const hasBreakdownData = effectiveTotal > 0;
  const hasProjectionData = projection.history.length > 0 || projection.projection.length > 0;

  const breakdown = hasBreakdownData ? (
    <SafeToSpendBreakdownBar
      effectiveTotal={effectiveTotal}
      committedTotal={committedTotal}
      committedLiabilities={committedLiabilities}
      safeToSpend={safeToSpend}
    />
  ) : null;

  const metrics = hasBreakdownData ? (
    <SafeToSpendBreakdownMetrics
      safeToSpend={safeToSpend}
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
        isPositiveSafeToSpend={isPositiveSafeToSpend}
        amount={isOverCommitted ? shortfall : safeToSpend}
        currencyCode={currencyCode}
        loading={loading}
        infoDisabled={!detailsReady}
        onInfoPress={onInfoPress}
      />
    );

  return (
    <AppSurface
      elevation="none"
      background="transparent"
      paddingHorizontal="none"
      paddingVertical="none"
    >
      <SafeToSpendCardLayout
        summary={header}
        warning={
          <>
            {quality === 'stale' ? (
              <AppText color="secondary">
                {AppConfig.strings.dashboard.safeToSpendUi.forecastStale}
              </AppText>
            ) : null}
            {viewModel.asOf !== undefined ? (
              <AppText variant="caption" color="secondary">
                Based on {dayjs(viewModel.asOf).format('D MMM YYYY')} · {viewModel.safeToSpendDays}
                -day forecast
                {viewModel.generatedAt !== undefined
                  ? ` · updated ${dayjs(viewModel.generatedAt).format('D MMM, h:mm A')}`
                  : ''}
              </AppText>
            ) : null}
            {viewModel.snapshotAgeMs !== undefined ? (
              <AppText variant="caption" color="secondary">
                Saved{' '}
                {viewModel.snapshotAgeMs < 60_000
                  ? 'less than a minute'
                  : `${Math.floor(viewModel.snapshotAgeMs / 3_600_000)}h ${Math.floor((viewModel.snapshotAgeMs % 3_600_000) / 60_000)}m`}{' '}
                ago
              </AppText>
            ) : null}
            {quality !== 'stale' && viewModel.hasUnvaluedEntries ? (
              <IncompleteFxWarning
                testID="safe-to-spend-incomplete-warning"
                message={AppConfig.strings.dashboard.safeToSpendUi.incompleteFxWarning}
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
        }
        breakdown={quality === 'unavailable' ? null : breakdown}
        metrics={quality === 'unavailable' ? null : metrics}
        chart={quality === 'unavailable' ? null : chart}
      />
    </AppSurface>
  );
};
