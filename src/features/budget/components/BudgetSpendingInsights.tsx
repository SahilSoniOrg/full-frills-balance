import { AppButton, AppText, Icon } from '@/src/components/core';
import { DetailDisclosure } from '@/src/components/shared/DetailDisclosure';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Column, Row, Separator } from '@/src/design-system';
import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import type { BudgetUsage } from '@/src/services/budget/types';
import type { AccountId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';
import { formatDate } from '@/src/utils/dateUtils';
import { useState } from 'react';

interface Props {
  chartData: BudgetCumulativeChart | null;
  isLoading: boolean;
  error?: string;
  previousUsageError?: string;
  onRetry?: () => void;
  currencyCode: string;
  expenseAccounts: PlainAccount[];
  previousUsage: BudgetUsage | null;
  previousPeriodRange?: { startDate: number; endDate: number };
  onPreviousPeriod: () => void;
  onFilterCategory: (id: AccountId) => void;
  activityCategory: PlainAccount | null;
}

export function BudgetSpendingInsights({
  chartData,
  isLoading,
  error,
  previousUsageError,
  onRetry,
  currencyCode,
  expenseAccounts,
  previousUsage,
  previousPeriodRange,
  onPreviousPeriod,
  onFilterCategory,
  activityCategory,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const categories = chartData?.categories ?? [];
  const visibleCategories = showAll ? categories : categories.slice(0, 5);
  const entryCount = chartData?.entryCount ?? 0;
  const status = error ?? (isLoading ? 'Loading spending breakdown…' : undefined);
  return (
    <DetailDisclosure
      title="Where it went"
      icon={Icon.PieChart}
      summary={status ?? `${entryCount} entries · ${categories.length} categories`}
    >
      <Column gap="md">
        <AppText variant="caption" color="secondary">
          {status ??
            `${entryCount} recorded ${entryCount === 1 ? 'entry' : 'entries'} · net of refunds`}
        </AppText>
        {error && (
          <AppButton variant="secondary" onPress={onRetry}>
            Retry breakdown
          </AppButton>
        )}
        {!error && !isLoading && categories.length === 0 && (
          <AppText color="secondary">No category spending in this period.</AppText>
        )}
        {visibleCategories.map(category => {
          const account = expenseAccounts.find(item => item.id === category.accountId);
          return (
            <AppButton
              key={category.accountId}
              variant={activityCategory?.id === category.accountId ? 'secondary' : 'ghost'}
              accessibilityLabel={`Show ${account?.name ?? 'category'} activity`}
              accessibilityState={{ selected: activityCategory?.id === category.accountId }}
              onPress={() => onFilterCategory(category.accountId)}
              buttonStyle={{ alignItems: 'stretch' }}
            >
              <Column gap="xs" flex={1}>
                <Row justify="space-between" align="baseline" gap="sm" flexWrap="wrap">
                  <AppText weight="medium" style={{ flexShrink: 1 }}>
                    {account?.name ?? 'Unavailable category'}
                  </AppText>
                  <MoneyText
                    amount={category.spent}
                    currencyCode={currencyCode}
                    weight="semibold"
                  />
                </Row>
                <AppText
                  variant="caption"
                  color={category.hasUnvaluedEntries ? 'warning' : 'secondary'}
                >
                  {category.entryCount} {category.entryCount === 1 ? 'entry' : 'entries'}
                  {category.hasUnvaluedEntries ? ' · incomplete currency valuation' : ''}
                </AppText>
              </Column>
            </AppButton>
          );
        })}
        {categories.length > 5 && (
          <AppButton variant="ghost" onPress={() => setShowAll(value => !value)}>
            {showAll ? 'Show fewer categories' : `Show all ${categories.length} categories`}
          </AppButton>
        )}
        {!!chartData?.refunds && (
          <Row justify="space-between" align="baseline" gap="sm" flexWrap="wrap">
            <AppText variant="caption" color="secondary">
              Refunds and reversals included
            </AppText>
            <MoneyText amount={chartData.refunds} currencyCode={currencyCode} variant="body" />
          </Row>
        )}
        {chartData?.hasUnvaluedEntries && (
          <AppText variant="caption" color="warning">
            Some entries could not be converted. Category amounts are partial.
          </AppText>
        )}
        {previousPeriodRange && (
          <>
            <Separator />
            <Row justify="space-between" align="center" gap="sm" flexWrap="wrap">
              <AppText variant="body" weight="semibold">
                Previous period
              </AppText>
              <AppButton variant="ghost" size="sm" onPress={onPreviousPeriod}>
                View period
              </AppButton>
            </Row>
            <AppText variant="caption" color="secondary">
              {formatDate(previousPeriodRange.startDate)} –{' '}
              {formatDate(previousPeriodRange.endDate)}
            </AppText>
            {previousUsageError ? (
              <Column gap="xs">
                <AppText color="warning">{previousUsageError}</AppText>
                <AppButton variant="ghost" onPress={onRetry}>
                  Retry previous period
                </AppButton>
              </Column>
            ) : previousUsage ? (
              <Row gap="xs" align="baseline" flexWrap="wrap">
                <MoneyText amount={previousUsage.spent} currencyCode={currencyCode} variant="xl" />
                <AppText variant="caption" color="secondary">
                  spent over the full period
                </AppText>
              </Row>
            ) : (
              <AppText color="secondary">Loading previous period…</AppText>
            )}
            {previousUsage?.hasUnvaluedEntries && (
              <AppText variant="caption" color="warning">
                Previous spending has incomplete currency valuation.
              </AppText>
            )}
          </>
        )}
      </Column>
    </DetailDisclosure>
  );
}
