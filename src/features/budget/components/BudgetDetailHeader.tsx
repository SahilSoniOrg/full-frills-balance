import { MoneyText } from '@/src/components/shared/MoneyText';
import { LineChart } from '@/src/components/charts/LineChart';
import { Icon, AppCard, AppText, Badge, IvyIcon } from '@/src/components/core';
import { DetailDisclosure } from '@/src/components/shared/DetailDisclosure';
import { REPORT_CHART_LAYOUT, Shape, Size, Spacing } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { BudgetPeriodStepper } from './BudgetPeriodStepper';
import { BudgetUsageSummary } from './BudgetUsageSummary';
import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import { presentBudgetUsage } from '../helpers/budgetCardPresentation';
import { presentBudgetPeriod } from '../helpers/budgetDetailPresentation';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { BudgetUsage } from '@/src/services/budget/types';
import { PlainBudget } from '@/src/types/plainDtos';
import { getNow } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface BudgetDetailHeaderProps {
  budget: PlainBudget;
  usage: BudgetUsage;
  periodLabel: string;
  periodRange: { startDate: number; endDate: number };
  isCurrentMonth: boolean;
  chartData: BudgetCumulativeChart | null;
  prevMonth: () => void;
  nextMonth: () => void;
  resetToToday: () => void;
}

export function BudgetDetailHeader({
  budget,
  usage,
  periodLabel,
  periodRange,
  isCurrentMonth,
  chartData,
  prevMonth,
  nextMonth,
  resetToToday,
}: BudgetDetailHeaderProps) {
  const { theme } = useTheme();
  const [chartWidth, setChartWidth] = React.useState(0);
  const usageVm = presentBudgetUsage(usage);
  const stripColor = resolveThemeColor(theme, usageVm.statusColor) as string;
  const period = presentBudgetPeriod(periodRange, usage, getNow());

  return (
    <Column gap="lg">
      <Column gap="sm" align="center">
        <BudgetPeriodStepper
          label={periodLabel}
          onPrevious={prevMonth}
          onNext={nextMonth}
          canGoNext={!isCurrentMonth}
          showBackToToday={!isCurrentMonth}
          onBackToToday={resetToToday}
        />
        <AppText variant="caption" color="secondary" align="center">
          {period.dateRangeText}
        </AppText>
      </Column>

      <AppCard elevation="sm" style={styles.heroCard} overflow="visible">
        <Row align="center" gap="md" marginBottom="md">
          <IvyIcon
            name={Icon.PieChart}
            label={budget.name}
            color={stripColor}
            size={Size.avatarMd}
            shape="circle"
          />
          <Column flex={1} gap="xs">
            <AppText variant="heading">{budget.name}</AppText>
            <Row gap="sm" align="center" flexWrap="wrap">
              <Badge
                variant={usageVm.statusBadge.variant}
                size="sm"
                icon={usageVm.statusBadge.icon}
              >
                {usageVm.statusBadge.text}
              </Badge>
              {budget.active === false && (
                <Badge variant="default" size="sm">
                  Inactive
                </Badge>
              )}
              <AppText variant="caption" color="secondary">
                {budget.currencyCode}
              </AppText>
            </Row>
          </Column>
        </Row>
        <BudgetUsageSummary usage={usage} currencyCode={budget.currencyCode} variant="detail" />
        <Column gap="xs" marginTop="md">
          <AppText variant="caption" color="secondary">
            {period.timingText}
          </AppText>
          {period.dailyRemaining !== undefined && (
            <Row align="baseline" gap="xs" flexWrap="wrap">
              <MoneyText
                amount={period.dailyRemaining}
                currencyCode={budget.currencyCode}
                variant="body"
                weight="semibold"
              />
              <AppText variant="caption" color="secondary">
                per day from the remaining budget
              </AppText>
            </Row>
          )}
        </Column>
        {chartData && chartData.data.length > 0 && (
          <DetailDisclosure
            title="Spending trend"
            icon={Icon.BarChart}
            summary="Cumulative recorded spending"
            variant="plain"
          >
            <View
              style={styles.chartContainer}
              onLayout={event => setChartWidth(event.nativeEvent.layout.width)}
            >
              {chartWidth > 0 && (
                <LineChart
                  data={chartData.data}
                  currencyCode={budget.currencyCode}
                  domainX={chartData.domainX}
                  todayX={isCurrentMonth ? getNow() : undefined}
                  xTicks={[chartData.domainX[0], chartData.domainX[1]]}
                  formatXTick={x => dayjs(x).format('MMM D')}
                  width={chartWidth}
                  height={170}
                  color={stripColor}
                  renderTooltipContent={index => {
                    const point = chartData.data[index];
                    if (!point) return null;
                    return (
                      <View>
                        <AppText
                          variant="caption"
                          color="secondary"
                          style={{ marginBottom: REPORT_CHART_LAYOUT.tooltipDateMarginBottom }}
                        >
                          {dayjs(point.x).format('MMM D')}
                        </AppText>
                        <MoneyText
                          amount={point.y}
                          currencyCode={budget.currencyCode}
                          variant="body"
                          weight="bold"
                        />
                      </View>
                    );
                  }}
                />
              )}
            </View>
          </DetailDisclosure>
        )}
      </AppCard>
    </Column>
  );
}

const styles = StyleSheet.create({
  heroCard: { padding: Spacing.lg, borderRadius: Shape.radius.xl },
  chartContainer: { marginHorizontal: -Spacing.lg },
});
