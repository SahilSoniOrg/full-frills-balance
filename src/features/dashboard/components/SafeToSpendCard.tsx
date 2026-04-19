import { AppSurface } from '@/src/components/core';
import { Column, Separator } from '@/src/design-system';
import { SafeToSpendResult } from '@/src/services/notification/NotificationService';
import React from 'react';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { SafeToSpendBreakdownBar } from './SafeToSpendBreakdownBar';
import { SafeToSpendChart } from './SafeToSpendChart';
import { SafeToSpendHeader } from './SafeToSpendHeader';

export interface SafeToSpendCardProps extends SafeToSpendResult {
  isLoading?: boolean;
  onInfoPress: () => void;
  onLegendPress: (i: 'safe' | 'committed' | 'debts' | null) => void;
  viewModel: SafeToSpendViewModel;
  isPrivacyMode?: boolean;
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
    <AppSurface elevation="none" paddingHorizontal="none" paddingVertical="sm">
      <Column gap="lg">
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

        <Separator />
      </Column>
    </AppSurface>
  );
};
