import { useState } from 'react';
import { PressScaleTouchable, AppSurface, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import type { SafeToSpendProjection } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendBreakdownMetrics } from './SafeToSpendBreakdownMetrics';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendCardLayout } from './SafeToSpendCardLayout';
import { SafeToSpendIncompleteDataModal } from './SafeToSpendIncompleteDataModal';
import { SafeToSpendHeader } from './SafeToSpendHeader';

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

  const loading = isLoading ?? vmLoading;
  const [isIncompleteDataVisible, setIncompleteDataVisible] = useState(false);
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

  const header = (
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
          viewModel.hasUnvaluedEntries ? (
            <PressScaleTouchable
              testID="safe-to-spend-incomplete-warning"
              accessibilityRole="button"
              accessibilityLabel={`${AppConfig.strings.dashboard.safeToSpendUi.incompleteFxWarning} ${AppConfig.strings.dashboard.safeToSpendUi.reviewIncompleteValues}`}
              accessibilityHint="Opens details about amounts left out of this estimate."
              onPress={() => setIncompleteDataVisible(true)}
              hitSlop={{ top: Spacing.sm, bottom: Spacing.sm }}
              style={{ alignSelf: 'stretch' }}
              surfaceStyle={{ gap: Spacing.xs, paddingVertical: Spacing.xs }}
            >
              <AppText variant="caption" color="warning">
                {AppConfig.strings.dashboard.safeToSpendUi.incompleteFxWarning}
              </AppText>
              <AppText variant="caption" weight="bold" color="warning">
                {AppConfig.strings.dashboard.safeToSpendUi.reviewIncompleteValues}
              </AppText>
            </PressScaleTouchable>
          ) : null
        }
        breakdown={breakdown}
        metrics={metrics}
        chart={chart}
      />
      <SafeToSpendIncompleteDataModal
        visible={isIncompleteDataVisible}
        onClose={() => setIncompleteDataVisible(false)}
        currencyCode={currencyCode}
        unvaluedStartingBalances={viewModel.unvaluedStartingBalances ?? []}
      />
    </AppSurface>
  );
};
