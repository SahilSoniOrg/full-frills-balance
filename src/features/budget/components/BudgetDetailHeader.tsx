import { MoneyText } from '@/src/components/shared/MoneyText';
import { IncompleteFxWarning } from '@/src/components/shared/IncompleteFxWarning';
import { AppCard, AppText, Badge } from '@/src/components/core';
import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { BudgetPeriodStepper } from './BudgetPeriodStepper';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { presentBudgetUsage } from '../helpers/budgetCardPresentation';
import { presentBudgetPeriod } from '../helpers/budgetDetailPresentation';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
import { useTheme } from '@/src/hooks/use-theme';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import type { BudgetUsage } from '@/src/services/budget/types';
import type { PlainBudget } from '@/src/types/plainDtos';
import { getNow } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

interface BudgetDetailHeaderProps {
  budget: PlainBudget;
  usage: BudgetUsage;
  periodLabel: string;
  periodRange: { startDate: number; endDate: number };
  isCurrentMonth: boolean;
  previousComparisonSpent: number | null;
  previousPeriodRange?: { startDate: number; endDate: number };
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
  previousComparisonSpent,
  previousPeriodRange,
  prevMonth,
  nextMonth,
  resetToToday,
}: BudgetDetailHeaderProps) {
  const { fonts } = useTheme();
  const isPrivate = useEffectivePrivacyMode();
  const strings = AppConfig.strings.budgetDetailRedesign;
  const period = presentBudgetPeriod(periodRange, usage, getNow());
  const usageVm = presentBudgetUsage(usage, period.elapsedShare);
  const statusText = usage.hasUnvaluedEntries
    ? strings.status.incomplete
    : usageVm.status === 'over'
      ? strings.status.over
      : usageVm.status === 'nearLimit'
        ? strings.status.nearLimit
        : usageVm.status === 'aheadOfPace'
          ? strings.status.aheadOfPace
          : strings.status.onPace;
  const overByPercent = isPrivate
    ? AppConfig.privacyMask
    : Math.round((Math.abs(usage.remaining) / Math.max(usage.budgetAmount, 1)) * 100);
  const heroAmount = usageVm.isOver ? Math.abs(usage.remaining) : usage.remaining;
  const isHistorical = !period.isCurrent;
  const hasNothingSpent = usage.spent === 0 && !usage.hasUnvaluedEntries;
  const comparisonLabel = previousPeriodRange
    ? isHistorical
      ? strings.total(dayjs(previousPeriodRange.startDate).format('MMM'))
      : strings.sameDay(dayjs(previousPeriodRange.startDate).format('MMM'))
    : undefined;

  return (
    <Column gap="sm">
      <BudgetPeriodStepper
        label={periodLabel}
        periodDetail={period.dateRangeText}
        daysLeft={period.isCurrent ? period.daysRemaining : undefined}
        onPrevious={prevMonth}
        onNext={nextMonth}
        canGoNext={!isCurrentMonth}
        showBackToToday={!isCurrentMonth}
        onBackToToday={resetToToday}
      />

      <AppCard elevation="sm" style={styles.heroCard}>
        <Row align="center" justify="space-between" gap="sm" flexWrap="wrap">
          <AppText variant="body" color="secondary" weight="medium">
            {usageVm.isOver ? strings.overTheLimit : strings.leftToSpend}
          </AppText>
          {!hasNothingSpent ? (
            <Badge variant={usageVm.statusBadge.variant} size="sm">
              {usage.hasUnvaluedEntries
                ? statusText
                : usageVm.isOver
                  ? strings.overBy(overByPercent)
                  : statusText}
            </Badge>
          ) : null}
        </Row>

        <View style={styles.amountLine}>
          <MoneyText
            amount={heroAmount}
            currencyCode={budget.currencyCode}
            prefix={usage.hasUnvaluedEntries ? '≈' : undefined}
            variant="title"
            color={usageVm.isOver ? 'error' : 'text'}
            style={[styles.heroAmount, { fontFamily: fonts.heading }]}
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.2}
          />
          <View style={styles.limitLine}>
            <AppText variant="caption" color="secondary">
              {usageVm.isOver ? strings.pastLimit : strings.limit}
            </AppText>
            <MoneyText
              amount={usage.budgetAmount}
              currencyCode={budget.currencyCode}
              variant="caption"
              color="secondary"
            />
          </View>
        </View>

        <BudgetProgressBar
          progress={usage.usagePercent * 100}
          statusColor={usageVm.statusColor}
          size="md"
          elapsedShare={period.isCurrent ? period.elapsedShare : undefined}
          accessibilityLabel={strings.chartAccessibilityLabel(
            statusText,
            strings.spentPercent(
              isPrivate ? AppConfig.privacyMask : Math.round(usage.usagePercent * 100),
            ),
            Math.round(period.elapsedShare * 100),
          )}
        />

        {usage.hasUnvaluedEntries ? (
          <IncompleteFxWarning
            message={
              usage.unvaluedCurrencyCounts?.length
                ? usage.unvaluedCurrencyCounts
                    .map(item => strings.missingFxEntries(item.count, item.currencyCode))
                    .join('\n')
                : strings.missingFxEntries(usage.unvaluedEntryCount ?? 1, budget.currencyCode)
            }
            onPress={() =>
              showIncompleteFxDetails({ context: 'budget', currencyCode: budget.currencyCode })
            }
          />
        ) : null}

        {usage.spent === 0 && !usage.hasUnvaluedEntries ? (
          <AppText variant="caption" color="secondary">
            {strings.nothingSpent}
          </AppText>
        ) : null}

        <View style={styles.stats}>
          <Stat label={strings.spent}>
            <MoneyText
              amount={usage.spent}
              currencyCode={budget.currencyCode}
              variant="body"
              weight="semibold"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.2}
            />
          </Stat>
          <Stat
            label={
              period.isCurrent && !usage.hasUnvaluedEntries ? strings.perDayLeft : strings.days
            }
          >
            {period.isCurrent &&
            !usage.hasUnvaluedEntries &&
            period.dailyRemaining !== undefined ? (
              usageVm.isOver ? (
                <AppText variant="body" weight="semibold">
                  —
                </AppText>
              ) : (
                <MoneyText
                  amount={period.dailyRemaining}
                  currencyCode={budget.currencyCode}
                  variant="body"
                  weight="semibold"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.2}
                />
              )
            ) : (
              <AppText variant="body" weight="semibold">
                {period.periodDays}
              </AppText>
            )}
          </Stat>
          {comparisonLabel && previousComparisonSpent !== null ? (
            <Stat label={comparisonLabel}>
              <MoneyText
                amount={previousComparisonSpent}
                currencyCode={budget.currencyCode}
                variant="body"
                weight="semibold"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.2}
              />
            </Stat>
          ) : null}
        </View>
      </AppCard>
    </Column>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  const { fontScale } = useWindowDimensions();
  return (
    <View
      style={[styles.stat, fontScale > 1.3 && { flexBasis: '100%', paddingBottom: Spacing.sm }]}
    >
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: { padding: Spacing.md, borderRadius: Shape.radius.xl, gap: Spacing.sm },
  amountLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: Spacing.xs,
    rowGap: Spacing.xs,
  },
  heroAmount: { flexShrink: 1, maxWidth: '100%' },
  limitLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: Spacing.xs },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingTop: Spacing.sm,
  },
  stat: { flexGrow: 1, flexBasis: 82, minWidth: 74, gap: Spacing.xs, paddingRight: Spacing.sm },
});
