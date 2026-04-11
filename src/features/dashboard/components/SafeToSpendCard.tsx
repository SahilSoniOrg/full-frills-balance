import { Spacing } from '@/src/constants';
import { Box, Separator, Stack } from '@/src/design-system';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendHeader } from './SafeToSpendHeader';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';

export interface SafeToSpendCardProps extends SafeToSpendResult {
  isLoading?: boolean;
  onInfoPress: () => void;
  onLegendPress: (i: 'safe' | 'committed' | 'debts' | null) => void;
  viewModel: SafeToSpendViewModel;
  isPrivacyMode?: boolean;
  uiState?: {
    isInfoVisible?: boolean;
    setInfoVisible?: (v: boolean) => void;
    expandedSection?: 'assets' | 'income' | 'committed' | 'debts' | null;
    setExpandedSection?: (s: 'assets' | 'income' | 'committed' | 'debts' | null) => void;
    selectedLegendItem?: 'safe' | 'committed' | 'debts' | null;
    setSelectedLegendItem?: (i: 'safe' | 'committed' | 'debts' | null) => void;
    isPrivacyMode?: boolean;
  };
}

export const SafeToSpendCard = (props: SafeToSpendCardProps) => {
  const { viewModel, projection, isLoading, isPrivacyMode, onInfoPress, onLegendPress } = props;

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

  return (
    <Box paddingVertical="xs">
      <Stack gap="lg">
        <SafeToSpendHeader
          isOverCommitted={isOverCommitted}
          isPositiveSafeToSpend={isPositiveSafeToSpend}
          displayValue={formatValue(isOverCommitted ? shortfall : safeToSpend)}
          onInfoPress={onInfoPress}
          isLoading={isLoading}
        />

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

        <Separator />

        <SafeToSpendChart
          projection={projection}
          safeToSpend={safeToSpend}
          isOverCommitted={isOverCommitted}
          isPrivacyMode={isPrivacyMode || false}
          formatValue={formatValue}
        />
        <Box style={{ marginBottom: Spacing.md }}>
          <Separator />
        </Box>
      </Stack>
    </Box>
  );
};
