import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppButton, AppSurface, PressScaleTouchable, AppText } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { presentBudgetUsage } from '../helpers/budgetCardPresentation';
import { presentBudgetPeriod } from '../helpers/budgetDetailPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { BudgetItem } from '../types';
import { BudgetProgressBar } from './BudgetProgressBar';
import { View } from 'react-native';
import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';

export function BudgetCard({
  item,
  onPress,
}: {
  item: BudgetItem;
  onPress: (item: BudgetItem) => void;
}) {
  const { fonts } = useTheme();
  const { budget, usage } = item;
  const strings = AppConfig.strings.commitmentsRedesign;
  const today = useCalendarDay();
  const period = presentBudgetPeriod(
    BudgetPeriodUtils.getCurrentPeriod(budget, today),
    usage,
    today,
  );
  const vm = presentBudgetUsage(usage, period.elapsedShare);
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const privateMode = useEffectivePrivacyMode();
  const headline = `${usage.hasUnvaluedEntries ? '≈ ' : ''}${vm.isOver ? strings.over(formatMoney(Math.abs(usage.remaining), budget.currencyCode)) : strings.left(formatMoney(usage.remaining, budget.currencyCode))}`;
  const spent = strings.spent(formatMoney(usage.spent, budget.currencyCode));
  const limit = strings.ofLimit(formatMoney(usage.budgetAmount, budget.currencyCode));
  const paceLabel = strings.paceAccessibility(
    vm.statusBadge.text,
    privateMode ? AppConfig.privacyMask : `${Math.round(usage.usagePercent * 100)}%`,
    `${Math.round(period.elapsedShare * 100)}%`,
  );
  const fxMessage = strings.missingFx(
    usage.unvaluedEntryCount ?? 1,
    (usage.unvaluedCurrencyCounts ?? [])
      .map(value => value.currencyCode)
      .filter(Boolean)
      .join(', '),
  );
  const statusLine = usage.hasUnvaluedEntries
    ? fxMessage
    : usage.spent <= 0
      ? strings.nothingSpent
      : vm.status === 'over'
        ? strings.overPercent(
            privateMode
              ? AppConfig.privacyMask
              : `${Math.round(Math.max(0, usage.usagePercent - 1) * 100)}%`,
          )
        : strings.daily(
            vm.statusBadge.text,
            formatMoney(period.dailyRemaining ?? 0, budget.currencyCode),
          );
  const isMonthly =
    (!budget.intervalType || budget.intervalType === 'MONTHLY') && (budget.intervalN || 1) === 1;
  return (
    <AppSurface
      elevation="sm"
      padding="md"
      radius="r3"
      background="surface"
      style={{ marginBottom: Spacing.sm }}
    >
      <PressScaleTouchable
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${strings.remainingAccessibility(budget.name, headline, spent, limit, paceLabel)}. ${strings.categorySummary(item.scopeAccounts.map(account => account?.name ?? strings.unavailableCategory).join(', '))}`}
        accessibilityHint={strings.opensBudget}
      >
        <Column gap="md">
          <Row justify="space-between" align="flex-start" gap="sm" flexWrap="wrap">
            <Column gap="sm" flexGrow={1} flexBasis={120}>
              <AppText variant="bodyLarge" weight="semibold">
                {budget.name}
              </AppText>
              <Row gap="sm" flexWrap="wrap">
                {item.scopeAccounts.slice(0, 2).map((account, index) => (
                  <View key={account?.id ?? index} style={{ maxWidth: '100%' }}>
                    <AccountInlineLabel
                      account={account}
                      placeholder={strings.unavailableCategory}
                      variant="caption"
                      showIcon
                    />
                  </View>
                ))}
                {item.scopeAccounts.length > 2 && (
                  <AppText variant="caption" color="secondary">
                    +{item.scopeAccounts.length - 2}
                  </AppText>
                )}
              </Row>
              {!isMonthly && (
                <AppText variant="caption" color="secondary">
                  {formatRecurrence(budget)}
                </AppText>
              )}
            </Column>
            <Column gap="xs" style={{ alignItems: 'flex-end', flexShrink: 1, marginLeft: 'auto' }}>
              <AppText
                variant="heading"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.2}
                color={vm.isOver ? 'error' : 'text'}
                style={{ fontFamily: fonts.heading }}
              >
                {headline}
              </AppText>
              <AppText variant="caption" color="secondary">
                {limit}
              </AppText>
            </Column>
          </Row>
          <BudgetProgressBar
            progress={usage.usagePercent * 100}
            statusColor={vm.statusColor}
            elapsedShare={period.elapsedShare}
            accessibilityLabel={paceLabel}
          />
          <Row justify="space-between" align="baseline" gap="sm" flexWrap="wrap">
            <AppText variant="caption" color="secondary">
              {spent}
            </AppText>
            {!usage.hasUnvaluedEntries && (
              <AppText
                variant="caption"
                color={
                  usage.hasUnvaluedEntries ||
                  vm.status === 'nearLimit' ||
                  vm.status === 'aheadOfPace'
                    ? 'warning'
                    : vm.status === 'over'
                      ? 'error'
                      : 'secondary'
                }
              >
                {statusLine}
              </AppText>
            )}
          </Row>
        </Column>
      </PressScaleTouchable>
      {usage.hasUnvaluedEntries && (
        <AppButton
          variant="ghost"
          accessibilityRole="button"
          accessibilityLabel={strings.fixFx(fxMessage)}
          buttonStyle={{ minHeight: Size.touchTarget, paddingHorizontal: 0 }}
          onPress={() =>
            showIncompleteFxDetails({ context: 'budget', currencyCode: budget.currencyCode })
          }
        >
          <AppText variant="caption" color="warning">
            {strings.fixFx(fxMessage)}
          </AppText>
        </AppButton>
      )}
    </AppSurface>
  );
}
