import { AppText } from '@/src/components/core';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { Spacing } from '@/src/constants/design-tokens';
import { budgetFormStrings as copy } from '@/src/constants/copy/domains/budgetFormStrings';
import { useTheme } from '@/src/hooks/use-theme';
import type { BudgetSpendingPeriod } from '../helpers/budgetSpendingHistory';
import { View } from 'react-native';

const CHART_HEIGHT = 72;

export function BudgetSpendingHistoryChart({
  periods,
  limit,
  average,
  currencyCode,
}: {
  periods: BudgetSpendingPeriod[];
  limit: number;
  average: number | null;
  currencyCode: string;
}) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const max = Math.max(limit, ...periods.map(period => period.spent), 1);
  const limitY = CHART_HEIGHT - (limit / max) * CHART_HEIGHT;
  const averageLabel =
    average == null ? undefined : copy.historyAverage(formatMoney(average, currencyCode));
  const summary = `${copy.historyTitle}. ${averageLabel ? `${averageLabel}. ` : ''}${copy.historyLimit(formatMoney(limit, currencyCode))}.`;

  return (
    <View
      testID="budget-spending-history-chart"
      accessibilityRole="image"
      accessibilityLabel={copy.historyAccessibility(summary)}
      style={{ gap: Spacing.xs }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="caption" color="secondary">
          {copy.historyTitle}
        </AppText>
        {averageLabel ? (
          <AppText variant="caption" weight="semibold" color="secondary">
            {averageLabel}
          </AppText>
        ) : null}
      </View>

      <View
        testID="budget-history-bars"
        style={{
          height: CHART_HEIGHT,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: Spacing.sm,
        }}
      >
        <View
          testID="budget-history-limit-line"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: limitY,
            borderTopWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.textSecondary,
            zIndex: 1,
          }}
        />
        {periods.map((period, index) => (
          <View
            key={`${period.startDate}-${index}`}
            testID={`budget-history-bar-${index}`}
            accessible={false}
            style={{
              flex: 1,
              height: CHART_HEIGHT,
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <View
              testID={`budget-history-bar-fill-${index}`}
              style={{
                width: '58%',
                height: Math.max(2, (period.spent / max) * CHART_HEIGHT),
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                backgroundColor: period.spent > limit ? theme.expense : theme.errorLight,
              }}
            />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.xs }}>
        <AppText variant="caption" color="secondary">
          {copy.historyStart(periods[0]?.label ?? '')}
        </AppText>
        <AppText variant="caption" color="secondary" style={{ flex: 1, textAlign: 'center' }}>
          {copy.historyLimit(formatMoney(limit, currencyCode))}
        </AppText>
        <AppText variant="caption" color="secondary">
          {copy.historyCurrent(periods.at(-1)?.label ?? '')}
        </AppText>
      </View>
    </View>
  );
}
