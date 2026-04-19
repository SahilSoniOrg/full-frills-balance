import { AppIcon, AppSurface } from '@/src/components/core';
import { ColorKey, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { Box, Column, Row, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { AppNavigation } from '@/src/utils/navigation';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useBudgetListViewModel } from '../hooks/useBudgetListViewModel';
import { BudgetItem } from '../types';

export function BudgetListView() {
  const { items } = useBudgetListViewModel();
  const { theme } = useTheme();

  const handlePress = (item: BudgetItem) => {
    AppNavigation.toBudgetDetail(item.budget.id, {
      name: item.budget.name,
      amount: item.budget.amount,
      currency: item.budget.currencyCode,
    });
  };

  const renderItem = ({ item }: { item: BudgetItem }) => {
    const { budget, usage } = item;
    const progress = Math.min(100, Math.max(0, usage.usagePercent * 100));

    let stripColor: ColorKey = 'primary';
    if (usage.usagePercent >= 1) {
      stripColor = 'error';
    } else if (usage.usagePercent >= 0.8) {
      stripColor = 'warning';
    }

    const isOver = usage.remaining < 0;

    return (
      <TouchableOpacity
        style={{ marginBottom: Spacing.md }}
        onPress={() => handlePress(item)}
        activeOpacity={Opacity.heavy}
      >
        <AppSurface
          elevation="sm"
          padding="lg"
          radius="r3" // using r3 to match the history card's softer corners
          background="surface"
          borderWidth={1}
          borderColor="surfaceSecondary"
        >
          <Column>
            <Row justify="space-between" align="stretch" marginBottom="lg">
              <Row gap="md" align="center" flex={1} marginRight="md">
                <Box
                  width={Size.xl}
                  height={Size.xl}
                  borderRadius="md"
                  alignItems="center"
                  justifyContent="center"
                  background="primary"
                  backgroundOpacity="soft"
                >
                  <AppIcon name="pieChart" color={stripColor} size={20} />
                </Box>
                <Column flex={1}>
                  <Text variant="lg" weight="bold" numberOfLines={1}>
                    {budget.name}
                  </Text>
                  {item.previousUsage && (
                    <Row align="center" gap="xs">
                      <AppIcon
                        name={item.previousUsage.remaining < 0 ? 'error' : 'checkCircle'}
                        size={12}
                        color={item.previousUsage.remaining < 0 ? theme.error : theme.success}
                      />
                      <Text
                        variant="xs"
                        opacity={0.7}
                        weight="medium"
                        color={item.previousUsage.remaining < 0 ? 'error' : 'success'}
                      >
                        {item.previousUsage.remaining < 0 ? 'Over' : 'Under'} last mo
                      </Text>
                    </Row>
                  )}
                </Column>
              </Row>
              <Column align="flex-end" justify="center">
                <Text variant="xl" weight="bold">
                  {CurrencyFormatter.format(budget.amount, budget.currencyCode, {
                    maximumFractionDigits: 0,
                  })}
                </Text>
              </Column>
            </Row>

            <Box
              unsafe_backgroundRaw={withOpacity('#000', Opacity.ghost)}
              padding="md"
              borderRadius="md"
            >
              <Column gap="md">
                <Row justify="space-between" align="center">
                  <Column gap="xs">
                    <Text variant="xs" color="secondary" weight="bold" opacity={0.6}>
                      SPENT
                    </Text>
                    <Text variant="base" weight="bold">
                      {CurrencyFormatter.format(usage.spent, budget.currencyCode, {
                        maximumFractionDigits: 0,
                      })}
                    </Text>
                  </Column>
                  <Column gap="xs" align="flex-end">
                    <Text variant="xs" color="secondary" weight="bold" opacity={0.6}>
                      {isOver ? 'OVER LIMIT' : 'LEFT'}
                    </Text>
                    <Row align="center" gap="xs">
                      {isOver && <AppIcon name="alert" size={14} color={theme.error} />}
                      <Text variant="base" weight="bold" color={isOver ? 'error' : 'success'}>
                        {CurrencyFormatter.format(Math.abs(usage.remaining), budget.currencyCode, {
                          maximumFractionDigits: 0,
                        })}
                      </Text>
                    </Row>
                  </Column>
                </Row>

                <Box height={6} background="surfaceSecondary" borderRadius="full" overflow="hidden">
                  <Box
                    height="100%"
                    width={`${progress}%`}
                    background={stripColor}
                    borderRadius="full"
                  />
                </Box>
              </Column>
            </Box>
          </Column>
        </AppSurface>
      </TouchableOpacity>
    );
  };

  return (
    <FlashList
      data={items}
      keyExtractor={item => item.budget.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <Column flex={1} align="center" justify="center" marginTop="xxxl">
          <AppIcon name="pieChart" size={64} color={theme.border} />
          <Text variant="subheading" color="secondary" marginTop="md">
            No budgets yet
          </Text>
        </Column>
      }
      contentContainerStyle={{
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xxxl,
      }}
    />
  );
}
