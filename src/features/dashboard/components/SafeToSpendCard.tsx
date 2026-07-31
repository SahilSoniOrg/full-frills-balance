import { useWindowDimensions, View } from 'react-native';
import { AppSurface } from '@/src/components/core';
import { Column, Row, Separator } from '@/src/design-system';
import { SafeToSpendDashboard } from '@/src/services/simulation/SafeToSpendReadModel';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendHeader } from './SafeToSpendHeader';

/** Width threshold where the card switches to side-by-side layout. */
const TABLET_BREAKPOINT = 600;

export interface SafeToSpendCardProps extends SafeToSpendDashboard {
  isLoading?: boolean;
  onInfoPress: () => void;
  onLegendPress: (i: 'safe' | 'committed' | 'debts' | null) => void;
  viewModel: SafeToSpendViewModel;
  /** When false, hides the projection chart; amount and breakdown stay. Default true. */
  showChart?: boolean;
}

export const SafeToSpendCard = (props: SafeToSpendCardProps) => {
  const { viewModel, projection, isLoading, onInfoPress, onLegendPress, showChart = true } = props;
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= TABLET_BREAKPOINT;

  const {
    formatValue,
    isOverCommitted,
    isPositiveSafeToSpend,
    committedTotal,
    effectiveTotal,
    safeToSpend,
    shortfall,
    committedLiabilities,
  } = viewModel;

  const breakdown = (
    <SafeToSpendBreakdownBar
      effectiveTotal={effectiveTotal}
      committedTotal={committedTotal}
      committedLiabilities={committedLiabilities}
      safeToSpend={safeToSpend}
      displaySafe={formatValue(safeToSpend)}
      displayCommitted={formatValue(committedTotal)}
      displayDebts={formatValue(committedLiabilities)}
      onLegendPress={onLegendPress}
    />
  );

  const chart = showChart ? (
    <SafeToSpendChart
      projection={projection}
      safeToSpend={safeToSpend}
      isOverCommitted={isOverCommitted}
      isPrivacyMode={viewModel.isPrivacyMode}
      currencyCode={viewModel.currencyCode}
      formatValue={formatValue}
    />
  ) : null;

  const header = (
    <SafeToSpendHeader
      isOverCommitted={isOverCommitted}
      isPositiveSafeToSpend={isPositiveSafeToSpend}
      displayValue={formatValue(isOverCommitted ? shortfall : safeToSpend)}
      onInfoPress={onInfoPress}
      isLoading={isLoading}
    />
  );

  const body =
    isWide && chart ? (
      <Row gap="lg" align="stretch" style={{ minHeight: 0 }}>
        <View style={{ flex: 2, minWidth: 0 }}>{breakdown}</View>
        <View style={{ flex: 3, minWidth: 0 }}>{chart}</View>
      </Row>
    ) : (
      <>
        {breakdown}
        {chart ? (
          <>
            <Separator />
            {chart}
            <Separator />
          </>
        ) : null}
      </>
    );

  return (
    <AppSurface elevation="none" paddingHorizontal="none" paddingVertical="sm">
      <Column gap="lg">
        {header}
        {body}
      </Column>
    </AppSurface>
  );
};
