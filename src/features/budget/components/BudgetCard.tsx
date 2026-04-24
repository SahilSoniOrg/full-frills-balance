import { AppIcon, AppSurface } from '@/src/components/core';
import { ColorKey, Opacity, Spacing } from '@/src/constants';
import { Box, Column, Row, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import dayjs from 'dayjs';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { BudgetItem } from '../types';
import { BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';

interface BudgetCardProps {
  item: BudgetItem;
  onPress: (item: BudgetItem) => void;
}

export function BudgetCard({ item, onPress }: BudgetCardProps) {
  const { theme } = useTheme();
  const { budget, usage, previousUsage } = item;

  const progress = Math.min(100, Math.max(0, usage.usagePercent * 100));
  const isOver = usage.remaining < 0;

  let statusColor: ColorKey = 'primary';
  if (usage.usagePercent >= 1) {
    statusColor = 'error';
  } else if (usage.usagePercent >= 0.8) {
    statusColor = 'warning';
  }

  const { endDate } = BudgetPeriodUtils.getCurrentPeriod(budget);
  const daysLeft = Math.max(0, dayjs(endDate).diff(dayjs(), 'day'));
  const periodLabel = BudgetPeriodUtils.getPeriodLabel(budget);

  return (
    <TouchableOpacity
      style={{ marginBottom: Spacing.md }}
      onPress={() => onPress(item)}
      activeOpacity={Opacity.heavy}
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
          {/* Header section */}
          <Row justify="space-between" align="center">
            <Row gap="md" align="center" flex={1}>
              <Box
                width={40}
                height={40}
                borderRadius="md"
                alignItems="center"
                justifyContent="center"
                background={statusColor}
                backgroundOpacity="soft"
              >
                <AppIcon name="pieChart" color={statusColor} size={20} />
              </Box>
              <Column flex={1}>
                <Text variant="lg" weight="bold" numberOfLines={1}>
                  {budget.name}
                </Text>
                <Row align="center" gap="xs">
                  <Text variant="xs" color="secondary" opacity={0.6} numberOfLines={1}>
                    {daysLeft === 0 ? 'Ends today' : `${daysLeft} days left`} • {periodLabel}
                  </Text>
                </Row>
              </Column>
            </Row>
            <Column align="flex-end">
              <Text variant="xl" weight="bold">
                {CurrencyFormatter.format(budget.amount, budget.currencyCode, {
                  maximumFractionDigits: 0,
                })}
              </Text>
              {previousUsage && (
                <Row align="center" gap="xs">
                  <AppIcon
                    name={previousUsage.remaining < 0 ? 'trendingDown' : 'trendingUp'}
                    size={12}
                    color={previousUsage.remaining < 0 ? theme.error : theme.success}
                  />
                  <Text
                    variant="xs"
                    weight="semibold"
                    color={previousUsage.remaining < 0 ? 'error' : 'success'}
                  >
                    {previousUsage.remaining < 0 ? 'Over' : 'Under'} last period
                  </Text>
                </Row>
              )}
            </Column>
          </Row>

          {/* Progress Section */}
          <Column gap="sm">
            <Row justify="space-between" align="flex-end">
              <Column gap="xs">
                <Text
                  variant="xs"
                  color="secondary"
                  weight="bold"
                  opacity={0.5}
                  letterSpacing={0.5}
                >
                  SPENT
                </Text>
                <Text variant="lg" weight="bold">
                  {CurrencyFormatter.format(usage.spent, budget.currencyCode, {
                    maximumFractionDigits: 0,
                  })}
                </Text>
              </Column>

              <Box
                background={isOver ? 'error' : 'success'}
                backgroundOpacity="soft"
                paddingHorizontal="sm"
                paddingVertical="xs"
                borderRadius="sm"
              >
                <Row align="center" gap="xs">
                  {isOver && <AppIcon name="alert" size={12} color={theme.error} />}
                  <Text variant="xs" weight="bold" color={isOver ? 'error' : 'success'}>
                    {isOver ? 'OVER' : 'REMAINING'}:{' '}
                    {CurrencyFormatter.format(Math.abs(usage.remaining), budget.currencyCode, {
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                </Row>
              </Box>
            </Row>

            <Box height={8} background="surfaceSecondary" borderRadius="full" overflow="hidden">
              <Box
                height="100%"
                width={`${progress}%`}
                background={statusColor}
                borderRadius="full"
              />
            </Box>
          </Column>
        </Column>
      </AppSurface>
    </TouchableOpacity>
  );
}
