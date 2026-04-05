import { Spacing } from '@/src/constants';
import { Box, Separator, Stack } from '@/src/design-system';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { useSafeToSpendView } from '../hooks/useSafeToSpendView';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendExplanationModal } from './SafeToSpendExplanationModal';
import { SafeToSpendHeader } from './SafeToSpendHeader';
import { SafeToSpendLegendModal } from './SafeToSpendLegendModal';

export interface SafeToSpendCardProps extends SafeToSpendResult {
  isLoading?: boolean;
}

export const SafeToSpendCard = (props: SafeToSpendCardProps) => {
  const {
    isPrivacyMode,
    isInfoVisible,
    setInfoVisible,
    expandedSection,
    setExpandedSection,
    selectedLegendItem,
    setSelectedLegendItem,
    format,
    isOverCommitted,
    isPositiveSafeToSpend,
    committedTotal,
    effectiveTotal,
    labels,
    info,
    // Derived values from hook
    safeToSpend,
    shortfall,
    committedBudget,
    committedPlanned,
    committedLiabilities,
  } = useSafeToSpendView(props);

  const {
    totalLiquidAssets,
    summary,
    breakdowns,
    projection,
    liquidAssetSubtypes,
    liquidAssetAccounts,
    isLoading,
  } = props;

  return (
    <Box paddingVertical="xs">
      <Stack gap="lg">
        <SafeToSpendHeader
          isOverCommitted={isOverCommitted}
          isPositiveSafeToSpend={isPositiveSafeToSpend}
          displayValue={format(isOverCommitted ? shortfall : safeToSpend)}
          onInfoPress={() => setInfoVisible(true)}
          isLoading={isLoading}
        />

        <SafeToSpendBreakdownBar
          effectiveTotal={effectiveTotal}
          committedTotal={committedTotal}
          committedLiabilities={committedLiabilities}
          safeToSpend={safeToSpend}
          displaySafe={format(safeToSpend)}
          displayCommitted={format(committedTotal)}
          displayDebts={format(committedLiabilities)}
          onLegendPress={setSelectedLegendItem}
        />

        <Separator />

        <SafeToSpendChart
          projection={projection}
          safeToSpend={safeToSpend}
          isOverCommitted={isOverCommitted}
          isPrivacyMode={isPrivacyMode}
          formatValue={format}
        />
        <Box style={{ marginBottom: Spacing.md }}>
          <Separator />
        </Box>
      </Stack>

      <SafeToSpendExplanationModal
        visible={isInfoVisible}
        onClose={() => setInfoVisible(false)}
        info={info}
        labels={labels}
        formatValue={format}
        totalLiquidAssets={totalLiquidAssets}
        totalFutureInflow={summary?.totalFutureInflow}
        committedBudget={committedBudget}
        committedPlanned={committedPlanned}
        committedLiabilities={committedLiabilities}
        safeToSpend={safeToSpend}
        liquidAssetSubtypes={liquidAssetSubtypes}
        liquidAssetAccounts={liquidAssetAccounts}
        incomeBreakdown={breakdowns?.income}
        committedBreakdown={breakdowns?.committed}
        debtBreakdown={breakdowns?.debt}
        firstMajorInflowDay={summary?.firstMajorInflowDay}
        totalLiabilities={breakdowns?.liabilities?.total}
        expandedSection={expandedSection}
        setExpandedSection={setExpandedSection}
      />

      <SafeToSpendLegendModal
        visible={!!selectedLegendItem}
        onClose={() => setSelectedLegendItem(null)}
        type={selectedLegendItem}
        labels={labels}
        formatValue={format}
        totalLiquidAssets={totalLiquidAssets}
        totalFutureInflow={summary?.totalFutureInflow}
        committedBudget={committedBudget}
        committedPlanned={committedPlanned}
        committedLiabilities={committedLiabilities}
        safeToSpend={safeToSpend}
        incomeBreakdown={breakdowns?.income}
        committedBreakdown={breakdowns?.committed}
        debtBreakdown={breakdowns?.debt}
        firstMajorInflowDay={summary?.firstMajorInflowDay}
        totalLiabilities={breakdowns?.liabilities?.total}
        committedLiabilitiesCC={breakdowns?.liabilities?.committedCreditCard}
        committedLiabilitiesOther={breakdowns?.liabilities?.committedOther}
        committedTotal={committedTotal}
      />
    </Box>
  );
};
