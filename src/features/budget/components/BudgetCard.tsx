import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppIcon, AppSurface } from '@/src/components/core';
import { Opacity, Spacing } from '@/src/constants';
import { Box, Column, Row, Text } from '@/src/design-system';
import { presentBudgetListCard } from '@/src/features/budget/helpers/budgetCardPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import { TouchableOpacity } from 'react-native';
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
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={Opacity.heavy}
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
                width={40}
                height={40}
                borderRadius="md"
                alignItems="center"
                justifyContent="center"
                background={vm.statusColor}
                backgroundOpacity="soft"
              >
                <AppIcon name="pieChart" color={vm.statusColor} size={20} />
              </Box>
              <Column flex={1} style={{ minWidth: 0 }}>
                <Text variant="lg" weight="bold" numberOfLines={1}>
                  {vm.name}
                </Text>
                <Text variant="xs" color="secondary" opacity={0.6} numberOfLines={1} marginTop="xs">
                  {vm.periodSubtitle}
                </Text>
              </Column>
            </Row>

            <Column align="flex-end" style={{ flexShrink: 0 }}>
              <Text variant="xl" weight="bold">
                {formatMoney(vm.amount, vm.currencyCode)}
              </Text>
              {vm.previousPeriodLabel && (
                <Row align="center" gap="xs" marginTop="xs">
                  <AppIcon
                    name={vm.previousPeriodIcon}
                    size={12}
                    color={vm.previousPeriodColor === 'error' ? theme.error : theme.success}
                  />
                  <Text variant="xs" weight="semibold" color={vm.previousPeriodColor}>
                    {vm.previousPeriodLabel}
                  </Text>
                </Row>
              )}
            </Column>
          </Row>

          <BudgetUsageSummary usage={usage} currencyCode={vm.currencyCode} variant="card" />
        </Column>
      </AppSurface>
    </TouchableOpacity>
  );
}
