import { useWindowDimensions, View } from 'react-native';
import { AppSurface } from '@/src/components/core';
import { Column, Row, Separator } from '@/src/design-system';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendHeader } from './SafeToSpendHeader';

/** Width threshold where the card switches to side-by-side layout. */
const TABLET_BREAKPOINT = 600;

export interface SafeToSpendCardProps extends SafeToSpendResult {
  isLoading?: boolean;
  onInfoPress: () => void;
  onLegendPress: (i: 'safe' | 'committed' | 'debts' | null) => void;
  viewModel: SafeToSpendViewModel;
  isPrivacyMode?: boolean;
}

export const SafeToSpendCard = (props: SafeToSpendCardProps) => {
  const { viewModel, projection, isLoading, isPrivacyMode, onInfoPress, onLegendPress } = props;
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

  const chart = (
    <SafeToSpendChart
      projection={projection}
      safeToSpend={safeToSpend}
      isOverCommitted={isOverCommitted}
      isPrivacyMode={isPrivacyMode || false}
      currencyCode={viewModel.currencyCode}
      formatValue={formatValue}
    />
  );

  return (
    <AppSurface elevation="none" paddingHorizontal="none" paddingVertical="sm">
      {isWide ? (
        <Column gap="lg">
          <SafeToSpendHeader
            isOverCommitted={isOverCommitted}
            isPositiveSafeToSpend={isPositiveSafeToSpend}
            displayValue={formatValue(isOverCommitted ? shortfall : safeToSpend)}
            onInfoPress={onInfoPress}
            isLoading={isLoading}
          />
          <Row gap="lg" align="stretch" style={{ minHeight: 0 }}>
            <View style={{ flex: 2, minWidth: 0 }}>{breakdown}</View>
            <View style={{ flex: 3, minWidth: 0 }}>{chart}</View>
          </Row>
        </Column>
      ) : (
        <Column gap="lg">
          <SafeToSpendHeader
            isOverCommitted={isOverCommitted}
            isPositiveSafeToSpend={isPositiveSafeToSpend}
            displayValue={formatValue(isOverCommitted ? shortfall : safeToSpend)}
            onInfoPress={onInfoPress}
            isLoading={isLoading}
          />
          {breakdown}
          <Separator />
          {chart}
          <Separator />
        </Column>
      )}
    </AppSurface>
  );
};
