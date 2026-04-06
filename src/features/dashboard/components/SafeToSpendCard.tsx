import { Spacing } from '@/src/constants';
import { Box, Separator, Stack } from '@/src/design-system';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { useSafeToSpendView } from '../hooks/useSafeToSpendView';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendHeader } from './SafeToSpendHeader';

export interface SafeToSpendCardProps extends SafeToSpendResult {
  isLoading?: boolean;
  onInfoPress: () => void;
  onLegendPress: (i: 'safe' | 'committed' | 'debts' | null) => void;
}

export const SafeToSpendCard = (props: SafeToSpendCardProps) => {
  const {
    format,
    isOverCommitted,
    isPositiveSafeToSpend,
    committedTotal,
    effectiveTotal,
    // Derived values from hook
    safeToSpend,
    shortfall,
    committedLiabilities,
  } = useSafeToSpendView(props);

  const { projection, isLoading } = props;

  return (
    <Box paddingVertical="xs">
      <Stack gap="lg">
        <SafeToSpendHeader
          isOverCommitted={isOverCommitted}
          isPositiveSafeToSpend={isPositiveSafeToSpend}
          displayValue={format(isOverCommitted ? shortfall : safeToSpend)}
          onInfoPress={props.onInfoPress}
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
          onLegendPress={props.onLegendPress}
        />

        <Separator />

        <SafeToSpendChart
          projection={projection}
          safeToSpend={safeToSpend}
          isOverCommitted={isOverCommitted}
          isPrivacyMode={false} // Card-level chart doesn't need privacy mode check here, hook handles formatting
          formatValue={format}
        />
        <Box style={{ marginBottom: Spacing.md }}>
          <Separator />
        </Box>
      </Stack>
    </Box>
  );
};
