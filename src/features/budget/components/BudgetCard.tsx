import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import {
  AppButton,
  AppIcon,
  AppSurface,
  Icon,
  PressScaleTouchable,
  AppText,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { presentBudgetUsage } from '../helpers/budgetCardPresentation';
import { presentBudgetPeriod } from '../helpers/budgetDetailPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { useCalendarDay } from '@/src/hooks/useCalendarDay';
import { getBudgetCurrentPeriod } from '@/src/services/budget/BudgetPeriodUtils';
import { BudgetItem } from '../types';
import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { View } from 'react-native';
import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';
import type { BudgetStatus } from '../helpers/budgetCardPresentation';

function statusIcon(status: BudgetStatus) {
  switch (status) {
    case 'over':
      return Icon.TrendingUp;
    case 'nearLimit':
    case 'aheadOfPace':
      return Icon.Alert;
    default:
      return Icon.Activity;
  }
}

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
  const period = presentBudgetPeriod(getBudgetCurrentPeriod(budget, today), usage, today);
  const vm = presentBudgetUsage(usage, period.elapsedShare);
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const privateMode = useEffectivePrivacyMode();
  const headline = `${usage.hasUnvaluedEntries ? '≈ ' : ''}${vm.isOver ? strings.over(formatMoney(Math.abs(usage.remaining), budget.currencyCode)) : strings.left(formatMoney(usage.remaining, budget.currencyCode))}`;
  const spentAmount = formatMoney(usage.spent, budget.currencyCode);
  const spent = strings.spent(spentAmount);
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
  const statusColor =
    vm.status === 'nearLimit' || vm.status === 'aheadOfPace'
      ? 'warning'
      : vm.status === 'over'
        ? 'error'
        : 'secondary';
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
  const statusDisplay =
    usage.hasUnvaluedEntries || usage.spent <= 0
      ? statusLine
      : vm.status === 'over'
        ? privateMode
          ? AppConfig.privacyMask
          : `${Math.round(Math.max(0, usage.usagePercent - 1) * 100)}%`
        : `${formatMoney(period.dailyRemaining ?? 0, budget.currencyCode)}/day`;
  const isMonthly =
    (!budget.intervalType || budget.intervalType === 'MONTHLY') && (budget.intervalN || 1) === 1;
  return (
    <AppSurface
      elevation="sm"
      padding="sm"
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
        <Column gap="sm">
          <Row justify="space-between" align="flex-start" gap="sm" flexWrap="wrap">
            <Column gap="xs" flexGrow={1} flexBasis={120}>
              <AppText variant="body" weight="semibold">
                {budget.name}
              </AppText>
              <Row gap="xs" flexWrap="wrap" align="center">
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
                  <Row gap="xs" align="center">
                    <AppIcon name={Icon.FolderOpen} size={Size.iconXs} color="textSecondary" />
                    <AppText variant="caption" color="secondary">
                      +{item.scopeAccounts.length - 2}
                    </AppText>
                  </Row>
                )}
              </Row>
              {!isMonthly && (
                <Row gap="xs" align="center">
                  <AppIcon name={Icon.Repeat} size={Size.iconXs} color="textSecondary" />
                  <AppText variant="caption" color="secondary" numberOfLines={1}>
                    {formatRecurrence(budget)}
                  </AppText>
                </Row>
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
          <Row justify="space-between" align="center" gap="sm" flexWrap="wrap">
            <Row gap="xs" align="center">
              <AppIcon name={Icon.Receipt} size={Size.iconXs} color="textSecondary" />
              <AppText variant="caption" color="secondary" testID="budget-card-spent">
                {spentAmount}
              </AppText>
            </Row>
            {!usage.hasUnvaluedEntries && (
              <Row gap="xs" align="center">
                {usage.spent > 0 && (
                  <AppIcon name={statusIcon(vm.status)} size={Size.iconXs} color={statusColor} />
                )}
                {usage.spent <= 0 ? (
                  <AppIcon name={Icon.Clock} size={Size.iconXs} color="textSecondary" />
                ) : null}
                <AppText variant="caption" color={usage.spent <= 0 ? 'secondary' : statusColor}>
                  {statusDisplay}
                </AppText>
              </Row>
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
          <Row gap="xs" align="center">
            <AppIcon name={Icon.Alert} size={Size.iconXs} color="warning" />
            <AppText variant="caption" color="warning" numberOfLines={2} style={{ flexShrink: 1 }}>
              {strings.fixFx(fxMessage)}
            </AppText>
          </Row>
        </AppButton>
      )}
    </AppSurface>
  );
}
