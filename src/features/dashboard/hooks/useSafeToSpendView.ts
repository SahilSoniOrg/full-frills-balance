import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React, { useCallback, useMemo } from 'react';

export interface SafeToSpendViewProps extends SafeToSpendResult {
  isLoading?: boolean;
}

export function useSafeToSpendView(props: SafeToSpendViewProps) {
  const { summary, currencyCode, isLoading, totalLiquidAssets, breakdowns } = props;

  const { isPrivacyMode } = useUI();
  const [isInfoVisible, setInfoVisible] = React.useState(false);
  const [expandedSection, setExpandedSection] = React.useState<
    'assets' | 'income' | 'committed' | 'debts' | null
  >(null);
  const [selectedLegendItem, setSelectedLegendItem] = React.useState<
    'safe' | 'committed' | 'debts' | null
  >(null);

  const safeToSpend = summary?.safeToSpend ?? 0;
  const shortfall = summary?.shortfall ?? 0;
  const committedBudget = breakdowns?.budget?.currentMonthRemaining ?? 0;
  const committedPlanned = summary?.totalCommittedPlanned ?? 0;
  const committedLiabilities = breakdowns?.liabilities?.committed ?? 0;

  const format = useCallback(
    (val: number) => {
      if (isLoading) return null; // Let component handle skeleton
      if (isPrivacyMode) return '••••';

      const isVerySmall = Math.abs(val) > 0 && Math.abs(val) < 0.5;
      if (isVerySmall) {
        const oneFormatted = CurrencyFormatter.format(1, currencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
        return val > 0 ? `< ${oneFormatted}` : `> -${oneFormatted}`;
      }

      return CurrencyFormatter.format(val, currencyCode, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    },
    [isLoading, isPrivacyMode, currencyCode],
  );

  const isOverCommitted = shortfall > 0;
  const isPositiveSafeToSpend = safeToSpend > 0;
  const committedTotal = committedPlanned + committedBudget;

  const effectiveTotal = useMemo(
    () => Math.max(totalLiquidAssets || 0, committedTotal + committedLiabilities + safeToSpend),
    [totalLiquidAssets, committedTotal, committedLiabilities, safeToSpend],
  );

  const labels = AppConfig.strings.dashboard.safeToSpendUi;
  const info = AppConfig.strings.dashboard.safeToSpendExplanation;

  return {
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
    // Helper derived values for easier destructuring in components
    safeToSpend,
    shortfall,
    committedBudget,
    committedPlanned,
    committedLiabilities,
  };
}
