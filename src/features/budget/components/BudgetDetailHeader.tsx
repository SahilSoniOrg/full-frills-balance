import { MoneyText } from '@/src/components/common/MoneyText';
import { LineChart } from '@/src/components/charts/LineChart';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppCard, AppText, Badge, IvyIcon } from '@/src/components/core';
import { AppConfig, REPORT_CHART_LAYOUT, Shape, Size, Spacing } from '@/src/constants';
import { BudgetPeriodStepper } from '@/src/features/budget/components/BudgetPeriodStepper';
import { BudgetUsageSummary } from '@/src/features/budget/components/BudgetUsageSummary';
import { presentBudgetUsage } from '@/src/features/budget/helpers/budgetCardPresentation';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { BudgetUsage } from '@/src/services/budget/types';
import { PlainBudget } from '@/src/types/plainDtos';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface BudgetDetailHeaderProps {
  budget: PlainBudget;
  usage: BudgetUsage;
  periodLabel: string;
  isCurrentMonth: boolean;
  chartData: { data: { x: number; y: number }[]; domainX: [number, number] } | null;
  prevMonth: () => void;
  nextMonth: () => void;
  resetToToday: () => void;
}

export function BudgetDetailHeader({
  budget,
  usage,
  periodLabel,
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

  return (
    <View style={styles.headerContainer}>
      <AppCard elevation="sm" style={styles.heroCard} overflow="visible">
        <View style={styles.cardHeader}>
          <IvyIcon
            name="pieChart"
            label={budget.name}
            color={stripColor}
            size={Size.avatarMd}
            shape="circle"
          />
          <View style={styles.titleInfo}>
            <AppText variant="title">{budget.name}</AppText>
            <MoneyText
              amount={budget.amount}
              currencyCode={budget.currencyCode}
              formatStyle="compact"
              variant="heading"
            />
            <Badge variant={usageVm.statusBadge.variant} size="sm" icon={usageVm.statusBadge.icon}>
              {usageVm.statusBadge.text}
            </Badge>
          </View>
        </View>

        <BudgetUsageSummary usage={usage} currencyCode={budget.currencyCode} variant="detail" />

        {chartData && chartData.data.length > 0 && (
          <View
            style={styles.chartContainer}
            onLayout={event => setChartWidth(event.nativeEvent.layout.width)}
          >
            {chartWidth > 0 && (
              <LineChart
                data={chartData.data}
                currencyCode={budget.currencyCode}
                domainX={chartData.domainX}
                width={chartWidth}
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
                        formatStyle="compact"
                        variant="body"
                        weight="bold"
                      />
                    </View>
                  );
                }}
              />
            )}
          </View>
        )}
      </AppCard>

      <ScreenSectionHeader
        title={AppConfig.strings.budget.activityTitle}
        style={styles.activityTitle}
        action={
          <BudgetPeriodStepper
            label={periodLabel}
            onPrevious={prevMonth}
            onNext={nextMonth}
            canGoNext={!isCurrentMonth}
            showBackToToday={!isCurrentMonth}
            onBackToToday={resetToToday}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    marginBottom: Spacing.md,
  },
  heroCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Shape.radius.xl,
  },
  chartContainer: {
    marginTop: Spacing.lg,
    marginLeft: -Spacing.lg,
    marginRight: -Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  titleInfo: {
    marginLeft: Spacing.md,
    flex: 1,
    gap: Spacing.xs,
  },
  activityTitle: {
    paddingBottom: Spacing.sm,
  },
});
