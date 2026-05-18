import { LineChart } from '@/src/components/charts/LineChart';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppButton, AppCard, AppIcon, AppText, IvyIcon } from '@/src/components/core';
import { REPORT_CHART_LAYOUT, Shape, Size, Spacing } from '@/src/constants';
import Budget from '@/src/data/models/Budget';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { PlainBudget } from '@/src/types/domain';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface BudgetDetailHeaderProps {
  budget: Budget | PlainBudget;
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
  const [chartWidth, setChartWidth] = React.useState<number>(0);

  const progress = Math.min(100, Math.max(0, usage.usagePercent * 100));
  let stripColorBase = theme.primary;
  if (usage.usagePercent >= 1) {
    stripColorBase = theme.error;
  } else if (usage.usagePercent >= 0.8) {
    stripColorBase = theme.warning;
  }
  const stripColor = resolveThemeColor(theme, stripColorBase) as string;

  const isOver = usage.remaining < 0;

  return (
    <View style={styles.headerContainer}>
      <View style={styles.monthSelector}>
        <AppButton variant="ghost" onPress={prevMonth} size="sm">
          <AppIcon name="chevronLeft" size={24} color={theme.text} />
        </AppButton>
        <AppText variant="heading" style={{ minWidth: 120, textAlign: 'center' }}>
          {periodLabel}
        </AppText>
        <AppButton variant="ghost" onPress={nextMonth} size="sm" disabled={isCurrentMonth}>
          <AppIcon
            name="chevronRight"
            size={24}
            color={isCurrentMonth ? theme.border : theme.text}
          />
        </AppButton>
      </View>

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
            <AppText variant="heading">
              {CurrencyFormatter.format(budget.amount, budget.currencyCode, {
                maximumFractionDigits: 0,
              })}
            </AppText>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <AppText variant="caption" color="secondary">
              Spent
            </AppText>
            <AppText variant="subheading" style={{ marginTop: 4 }}>
              {CurrencyFormatter.format(usage.spent, budget.currencyCode, {
                maximumFractionDigits: 0,
              })}
            </AppText>
          </View>
          <View style={styles.statItem}>
            <AppText variant="caption" color="secondary">
              {isOver ? 'Over Limit' : 'Left'}
            </AppText>
            <View style={styles.remainingRow}>
              {isOver && (
                <AppIcon name="alert" size={14} color={theme.error} style={{ marginRight: 4 }} />
              )}
              <AppText variant="subheading" color={isOver ? 'error' : 'success'}>
                {CurrencyFormatter.format(Math.abs(usage.remaining), budget.currencyCode, {
                  maximumFractionDigits: 0,
                })}
              </AppText>
            </View>
          </View>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View
            style={[styles.progressFill, { width: `${progress}%`, backgroundColor: stripColor }]}
          />
        </View>

        {chartData && chartData.data.length > 0 && (
          <View
            style={styles.chartContainer}
            onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
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
                      <AppText variant="body" weight="bold">
                        {CurrencyFormatter.format(point.y, budget.currencyCode, {
                          maximumFractionDigits: 0,
                        })}
                      </AppText>
                    </View>
                  );
                }}
              />
            )}
          </View>
        )}

        {!isCurrentMonth && (
          <AppButton
            variant="ghost"
            onPress={resetToToday}
            size="sm"
            style={styles.cardTodayButton}
          >
            <AppText variant="caption" color="primary" weight="bold">
              BACK TO TODAY
            </AppText>
          </AppButton>
        )}
      </AppCard>

      <ScreenSectionHeader title="Activity" style={styles.activityTitle} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    marginBottom: Spacing.xl,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  cardTodayButton: {
    marginTop: Spacing.md,
  },
  heroCard: {
    marginBottom: Spacing.xl,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Shape.radius.xl,
  },
  chartContainer: {
    marginTop: Spacing.xl,
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
  statsContainer: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
  },
  statItem: {
    flex: 1,
  },
  remainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: Shape.radius.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  activityTitle: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
