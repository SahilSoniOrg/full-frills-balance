import { AppConfig } from '@/src/constants';
import { AppSurface, AppText, Badge } from '@/src/components/core';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Column, Row } from '@/src/design-system';
import { BudgetProgressBar } from './BudgetProgressBar';
import { presentBudgetUsage } from '../helpers/budgetCardPresentation';
import { summarizeBudgetList } from '../helpers/budgetListPresentation';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import dayjs from 'dayjs';

export function BudgetListSummary({
  summary,
}: {
  summary: ReturnType<typeof summarizeBudgetList>;
}) {
  const strings = AppConfig.strings.commitmentsRedesign;
  const { usage, period, periodRange, currencyCode } = summary;
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const privateMode = useEffectivePrivacyMode();
  const status = presentBudgetUsage(usage, period?.elapsedShare);
  const markerLabel = period
    ? strings.todayMarker(Math.round(period.elapsedShare * period.periodDays), period.periodDays)
    : undefined;
  return (
    <AppSurface elevation="sm" padding="md" radius="r3" background="surface">
      <Column gap="sm">
        <Row justify="space-between" align="center" gap="sm" flexWrap="wrap">
          <AppText variant="caption" color="secondary" weight="medium">
            {period && periodRange
              ? strings.period(dayjs(periodRange.startDate).format('MMMM'), period.daysRemaining)
              : strings.monthlyBudgets}
          </AppText>
          {summary.overCount > 0 && (
            <Badge variant="error" size="sm">
              {strings.overCount(summary.overCount)}
            </Badge>
          )}
        </Row>
        <Row align="baseline" gap="sm" flexWrap="wrap">
          <MoneyText
            amount={Math.abs(usage.remaining)}
            currencyCode={currencyCode}
            formatStyle="compact"
            prefix={usage.hasUnvaluedEntries ? '≈ ' : undefined}
            variant="title"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.2}
            style={{ maxWidth: '100%', flexShrink: 1 }}
            color={usage.remaining < 0 ? 'error' : 'text'}
          />
          <AppText variant="caption" color="secondary">
            {usage.remaining < 0
              ? strings.overOfLimit(formatMoney(usage.budgetAmount, currencyCode))
              : strings.leftOfLimit(formatMoney(usage.budgetAmount, currencyCode))}
          </AppText>
        </Row>
        <BudgetProgressBar
          progress={usage.usagePercent * 100}
          statusColor={status.statusColor}
          size="md"
          elapsedShare={period?.elapsedShare}
          accessibilityLabel={
            period
              ? strings.paceAccessibility(
                  status.statusBadge.text,
                  privateMode ? AppConfig.privacyMask : `${Math.round(usage.usagePercent * 100)}%`,
                  `${Math.round(period.elapsedShare * 100)}%`,
                )
              : undefined
          }
        />
        <Row justify="space-between" gap="sm" flexWrap="wrap">
          <AppText variant="caption" color="secondary">
            {strings.spent(formatMoney(usage.spent, currencyCode))}
          </AppText>
          {markerLabel && (
            <AppText variant="caption" color="secondary">
              {markerLabel}
            </AppText>
          )}
        </Row>
        {summary.otherCurrencyCount > 0 && (
          <AppText variant="caption" color="secondary">
            {strings.otherCurrencies(summary.otherCurrencyCount)}
          </AppText>
        )}
        {summary.excludedCadenceCount > 0 && (
          <AppText variant="caption" color="secondary">
            {strings.otherCadences(summary.excludedCadenceCount)}
          </AppText>
        )}
      </Column>
    </AppSurface>
  );
}
