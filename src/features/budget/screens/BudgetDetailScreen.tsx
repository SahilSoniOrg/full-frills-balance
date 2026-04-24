import { LineChart } from '@/src/components/charts/LineChart';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { AppButton, AppCard, AppIcon, AppText, IvyIcon, LoadingView } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { resolveThemeColor } from '@/src/design-system/utils';
import { REPORT_CHART_LAYOUT, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { AppNavigation } from '@/src/utils/navigation';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useBudgetDetailViewModel } from '../hooks/useBudgetDetailViewModel';

export function BudgetDetailScreen() {
  const vm = useBudgetDetailViewModel();
  const { theme } = useTheme();

  const [chartWidth, setChartWidth] = React.useState<number>(0);

  if (vm.isLoading || !vm.budget || !vm.usage) {
    return (
      <Screen showBack backIcon="back">
        <LoadingView loading={true} text="Loading budget..." size="large" />
      </Screen>
    );
  }

  const { budget, usage } = vm;

  const progress = Math.min(100, Math.max(0, usage.usagePercent * 100));
  let stripColorBase = theme.primary;
  if (usage.usagePercent >= 1) {
    stripColorBase = theme.error;
  } else if (usage.usagePercent >= 0.8) {
    stripColorBase = theme.warning;
  }
  const stripColor = resolveThemeColor(theme, stripColorBase) as string;

  const isOver = usage.remaining < 0;

  const listHeader = (
    <View style={styles.headerContainer}>
      <View style={styles.monthSelector}>
        <AppButton variant="ghost" onPress={vm.prevMonth} size="sm">
          <AppIcon name="chevronLeft" size={24} color={theme.text} />
        </AppButton>
        <AppText variant="heading" style={{ minWidth: 120, textAlign: 'center' }}>
          {vm.periodLabel}
        </AppText>
        <AppButton variant="ghost" onPress={vm.nextMonth} size="sm" disabled={vm.isCurrentMonth}>
          <AppIcon
            name="chevronRight"
            size={24}
            color={vm.isCurrentMonth ? theme.border : theme.text}
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

        {vm.chartData && vm.chartData.data.length > 0 && (
          <View
            style={styles.chartContainer}
            onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
          >
            {chartWidth > 0 && (
              <LineChart
                data={vm.chartData.data}
                domainX={vm.chartData.domainX}
                width={chartWidth}
                color={stripColor}
                renderTooltipContent={index => {
                  const point = vm.chartData!.data[index];
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

        {!vm.isCurrentMonth && (
          <AppButton
            variant="ghost"
            onPress={vm.resetToToday}
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

  return (
    <Screen
      showBack
      backIcon="back"
      title="Budget Details"
      headerActions={
        <ScreenHeaderActions
          actions={[
            {
              name: 'edit',
              onPress: () =>
                AppNavigation.toBudgetForm(budget.id, {
                  name: budget.name,
                  amount: budget.amount,
                  currency: budget.currencyCode,
                }),
              iconColor: theme.text,
              size: Typography.sizes.xl,
              testID: 'edit-button',
            },
            {
              name: 'delete',
              onPress: vm.handleDelete,
              iconColor: theme.error,
              size: Typography.sizes.xl,
              testID: 'delete-button',
            },
          ]}
        />
      }
    >
      <View style={styles.container}>
        <TransactionListView
          items={vm.items}
          isLoading={vm.isLoading}
          isLoadingMore={false}
          emptyTitle="No activity"
          emptySubtitle="No transactions found for this budget in the selected month."
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  listContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
});
