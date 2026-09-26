import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { Icon, AppIcon, AppSurface, PressScaleTouchable, AppText } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { Box, Column, Row } from '@/src/design-system';
import { presentBudgetListCard } from '@/src/features/budget/helpers/budgetCardPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { BudgetItem } from '../types';
import { BudgetUsageSummary } from './BudgetUsageSummary';

interface BudgetCardProps {
  item: BudgetItem;
  onPress: (item: BudgetItem) => void;
}

export function BudgetCard({ item, onPress }: BudgetCardProps) {
  const { theme } = useTheme();
  const { budget, usage, previousUsage } = item;
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const vm = presentBudgetListCard(budget, usage, previousUsage);

  return (
    <PressScaleTouchable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={vm.name}
      style={{ marginBottom: Spacing.md }}
    >
      <AppSurface
        elevation="sm"
        padding="lg"
        radius="r3"
        background="surface"
        borderWidth={1}
        borderColor="surfaceSecondary"
      >
        <Column gap="lg">
          <Row justify="space-between" align="center" gap="md">
            <Row gap="md" align="center" flex={1} style={{ minWidth: 0 }}>
              <Box
                width={Size.xl}
                height={Size.xl}
                borderRadius="md"
                alignItems="center"
                justifyContent="center"
                background={vm.statusColor}
                backgroundOpacity="soft"
              >
                <AppIcon name={Icon.PieChart} color={vm.statusColor} size={Size.iconSm} />
              </Box>
              <Column flex={1} style={{ minWidth: 0 }}>
                <AppText variant="bodyLarge" weight="bold" numberOfLines={1}>
                  {vm.name}
                </AppText>
                <AppText
                  variant="caption"
                  color="secondary"
                  numberOfLines={1}
                  style={{ opacity: 0.6, marginTop: Spacing.xs }}
                >
                  {vm.periodSubtitle}
                </AppText>
              </Column>
            </Row>

            <Column align="flex-end" style={{ flexShrink: 0 }}>
              <AppText variant="heading" weight="bold">
                {formatMoney(vm.amount, vm.currencyCode)}
              </AppText>
              {vm.previousPeriodLabel && (
                <Row align="center" gap="xs" marginTop="xs">
                  <AppIcon
                    name={vm.previousPeriodIcon}
                    size={Size.xxs}
                    color={
                      vm.previousPeriodColor === 'error'
                        ? theme.error
                        : vm.previousPeriodColor === 'warning'
                          ? theme.warning
                          : theme.success
                    }
                  />
                  <AppText variant="caption" weight="semibold" color={vm.previousPeriodColor}>
                    {vm.previousPeriodLabel}
                  </AppText>
                </Row>
              )}
            </Column>
          </Row>

          <BudgetUsageSummary usage={usage} currencyCode={vm.currencyCode} variant="card" />
        </Column>
      </AppSurface>
    </PressScaleTouchable>
  );
}
