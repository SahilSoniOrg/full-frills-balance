import { MoneyText } from '@/src/components/shared/MoneyText';
import { IncompleteFxWarning } from '@/src/components/shared/IncompleteFxWarning';
import { AppCard, AppText, Badge } from '@/src/components/core';
import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { PeriodStepper } from '@/src/components/shared/PeriodStepper';
import { AppConfig, Shape, Spacing, Typography } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { presentBudgetUsage } from '../helpers/budgetCardPresentation';
import type { BudgetPeriodPresentation } from '../helpers/budgetDetailPresentation';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import type { BudgetUsage } from '@/src/services/budget/types';
import type { PlainBudget } from '@/src/types/plainDtos';
import dayjs from 'dayjs';
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

interface BudgetDetailHeaderProps {
  budget: PlainBudget;
  usage: BudgetUsage;
  periodLabel: string;
  period: BudgetPeriodPresentation;
  isCurrentPeriod: boolean;
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
  period,
  isCurrentPeriod,
  previousComparisonSpent,
  previousPeriodRange,
  prevMonth,
  nextMonth,
  resetToToday,
}: BudgetDetailHeaderProps) {
  const isPrivate = useEffectivePrivacyMode();
  const strings = AppConfig.strings.budgetDetailRedesign;
  const usageVm = presentBudgetUsage(usage, period.elapsedShare);
  const statusText = usage.hasUnvaluedEntries
    ? strings.status.incomplete
    : strings.status[usageVm.status];
  const overByPercent = isPrivate
    ? AppConfig.privacyMask
    : Math.round((Math.abs(usage.remaining) / Math.max(usage.budgetAmount, 1)) * 100);
  const heroAmount = usageVm.isOver ? Math.abs(usage.remaining) : usage.remaining;
  const isHistorical = !period.isCurrent;
  const hasNothingSpent = usage.spent === 0 && !usage.hasUnvaluedEntries;
  const periodStrings = AppConfig.strings.common.period;
  const comparisonLabel = previousPeriodRange
    ? isHistorical
      ? periodStrings.total(dayjs(previousPeriodRange.startDate).format('MMM'))
      : periodStrings.sameDay(dayjs(previousPeriodRange.startDate).format('MMM'))
    : undefined;

  return (
    <Column gap="sm">
      <PeriodStepper
        label={periodLabel}
        period={period}
        onPrevious={prevMonth}
        onNext={nextMonth}
        canGoNext={!isCurrentPeriod}
        showBackToToday={!isCurrentPeriod}
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
            fit={{
              maxFontSize: Typography.roles.title.fontSize,
              minFontSize: Typography.sizes.xl,
              lineHeightRatio: Typography.roles.title.lineHeight / Typography.roles.title.fontSize,
              hug: true,
            }}
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
              fit={STAT_FIT}
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
                  fit={STAT_FIT}
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
                fit={STAT_FIT}
              />
            </Stat>
          ) : null}
        </View>
      </AppCard>
    </Column>
  );
}

const STAT_FIT = {
  maxFontSize: Typography.roles.body.fontSize,
  minFontSize: Typography.sizes.xs - 1,
  lineHeightRatio: Typography.roles.body.lineHeight / Typography.roles.body.fontSize,
};

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
