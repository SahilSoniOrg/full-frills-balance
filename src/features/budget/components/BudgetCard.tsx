import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { Icon, AppIcon, AppSurface, PressScaleTouchable, AppText } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { presentBudgetListCard } from '@/src/features/budget/helpers/budgetCardPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { BudgetItem } from '../types';
import { BudgetUsageSummary } from './BudgetUsageSummary';
import { View, type DimensionValue } from 'react-native';
import type { ReactNode } from 'react';
import type { PlainAccount } from '@/src/types/plainDtos';
import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';

interface BudgetCardProps {
  item: BudgetItem;
  onPress: (item: BudgetItem) => void;
}

export function BudgetCard({ item, onPress }: BudgetCardProps) {
  const { theme } = useTheme();
  const { budget, usage, previousUsage } = item;
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const vm = presentBudgetListCard(budget, usage, previousUsage);
  const isPrivacyMode = useEffectivePrivacyMode();
  const categories = item.scopeAccounts;
  const funding = item.fundingAccounts;
  const names = (accounts: (PlainAccount | undefined)[], placeholder: string) =>
    accounts.map(account => account?.name ?? placeholder).join(', ');

  return (
    <PressScaleTouchable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={[
        vm.name,
        `${vm.intervalLabel}, limit ${formatMoney(vm.amount, vm.currencyCode)}`,
        categories.length
          ? `Categories: ${names(categories, 'Unavailable category')}`
          : 'No categories selected',
        `Forecast: ${funding.length ? names(funding, 'Unavailable account') : 'Automatic account selection'}`,
        `Spent ${formatMoney(usage.spent, vm.currencyCode)}`,
        `${usage.remaining < 0 ? 'Over limit' : 'Remaining'} ${formatMoney(Math.abs(usage.remaining), vm.currencyCode)}`,
        vm.periodSubtitle,
        vm.previousPeriodLabel,
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens budget details"
      style={{ marginBottom: Spacing.sm }}
    >
      <AppSurface
        elevation="sm"
        padding="md"
        radius="r3"
        background="surface"
        borderWidth={1}
        borderColor="surfaceSecondary"
      >
        <Column gap="sm">
          <Row justify="space-between" align="flex-start" gap="sm" flexWrap="wrap">
            <Row gap="sm" align="center" flex={1} style={{ minWidth: '40%' }}>
              <AppIcon name={Icon.PieChart} color="textSecondary" size={Size.iconSm} />
              <AppText variant="body" weight="semibold" numberOfLines={2} style={{ flex: 1 }}>
                {vm.name}
              </AppText>
            </Row>

            <AppText
              variant="heading"
              weight="bold"
              style={{ flexShrink: 0, maxWidth: '100%', marginLeft: 'auto' }}
            >
              {formatMoney(vm.amount, vm.currencyCode)}
            </AppText>
          </Row>

          <Row align="center" gap="md">
            <AccountSummary
              accounts={categories}
              placeholder="Unavailable category"
              maxWidth={funding.length ? '48%' : '100%'}
              empty={
                <>
                  <AppIcon name={Icon.Tag} size={Size.xxs} color="warning" />
                  <AppText variant="caption" color="warning" numberOfLines={1}>
                    No categories
                  </AppText>
                </>
              }
            />
            <AccountSummary
              accounts={funding}
              placeholder="Unavailable account"
              maxWidth="48%"
              empty={
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel="Automatic funding account selection"
                >
                  <Row align="center" gap="xs">
                    <AppIcon name={Icon.Wallet} size={Size.xxs} color="textSecondary" />
                    <AppIcon name={Icon.Sparkles} size={Size.iconXs} color="textSecondary" />
                  </Row>
                </View>
              }
            />
          </Row>
          <BudgetUsageSummary usage={usage} currencyCode={vm.currencyCode} variant="card" />
          <Row justify="space-between" align="flex-start" gap="sm" flexWrap="wrap">
            <Row align="center" gap="md" flexShrink={1}>
              <Row align="center" gap="xs">
                <AppIcon name={Icon.Repeat} size={Size.iconXs} color="textSecondary" />
                <AppText variant="caption" color="secondary">
                  {vm.cadenceLabel}
                </AppText>
              </Row>
              <Row align="center" gap="xs">
                <AppIcon name={Icon.Clock} size={Size.iconXs} color="textSecondary" />
                <AppText variant="caption" color="secondary">
                  {vm.timingSummary}
                </AppText>
              </Row>
            </Row>
            {!isPrivacyMode && (
              <AppText variant="caption" style={{ color: theme[vm.statusColor] }} weight="medium">
                {Math.round(usage.usagePercent * 100)}%
              </AppText>
            )}
          </Row>
        </Column>
      </AppSurface>
    </PressScaleTouchable>
  );
}

/** First account plus a "+N" overflow count, or `empty` when none are selected. */
function AccountSummary({
  accounts,
  placeholder,
  maxWidth,
  empty,
}: {
  accounts: (PlainAccount | undefined)[];
  placeholder: string;
  maxWidth: DimensionValue;
  empty: ReactNode;
}) {
  return (
    <Row align="center" gap="xs" flexShrink={1} style={{ minWidth: 0, maxWidth }}>
      {accounts.length ? (
        <AccountInlineLabel
          account={accounts[0]}
          placeholder={placeholder}
          variant="caption"
          showIcon
        />
      ) : (
        empty
      )}
      {accounts.length > 1 && (
        <AppText variant="caption" color="secondary">
          +{accounts.length - 1}
        </AppText>
      )}
    </Row>
  );
}
