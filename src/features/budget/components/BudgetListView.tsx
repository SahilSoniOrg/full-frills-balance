import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { ColorKey, Shape, Size, Spacing } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { AppNavigation } from '@/src/utils/navigation';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
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
        style={styles.cardContainer}
        onPress={() => handlePress(item)}
        activeOpacity={0.8}
      >
        <AppCard elevation="md" padding="lg" radius="r2">
          <Stack gap="lg">
            <Inline justify="space-between" align="center">
              <Inline gap="md" align="center">
                <Box
                  width={Size.xl}
                  height={Size.xl}
                  borderRadius="md"
                  alignItems="center"
                  justifyContent="center"
                  background="surfaceSecondary"
                >
                  <AppIcon name="pieChart" color={stripColor} size={20} />
                </Box>
                <Stack>
                  <AppText variant="heading">{budget.name}</AppText>
                  {item.previousUsage && (
                    <Inline align="center" gap="xs">
                      <AppIcon
                        name={item.previousUsage.remaining < 0 ? 'error' : 'checkCircle'}
                        size={12}
                        color={item.previousUsage.remaining < 0 ? theme.error : theme.success}
                      />
                      <AppText
                        variant="caption"
                        color={item.previousUsage.remaining < 0 ? 'error' : 'success'}
                      >
                        Last mo: {item.previousUsage.remaining < 0 ? 'Over budget' : 'Under budget'}
                      </AppText>
                    </Inline>
                  )}
                </Stack>
              </Inline>
              <AppText variant="title">
                {CurrencyFormatter.format(budget.amount, budget.currencyCode, {
                  maximumFractionDigits: 0,
                })}
              </AppText>
            </Inline>

            <Inline justify="space-between" align="center">
              <Stack gap="xs">
                <AppText variant="caption" color="secondary">
                  Spent
                </AppText>
                <AppText variant="body">
                  {CurrencyFormatter.format(usage.spent, budget.currencyCode, {
                    maximumFractionDigits: 0,
                  })}
                </AppText>
              </Stack>
              <Stack gap="xs" align="flex-end">
                <AppText variant="caption" color="secondary">
                  {isOver ? 'Over Limit' : 'Left'}
                </AppText>
                <Inline align="center" gap="xs">
                  {isOver && <AppIcon name="alert" size={14} color={theme.error} />}
                  <AppText variant="body" color={isOver ? 'error' : 'success'}>
                    {CurrencyFormatter.format(Math.abs(usage.remaining), budget.currencyCode, {
                      maximumFractionDigits: 0,
                    })}
                  </AppText>
                </Inline>
              </Stack>
            </Inline>

            <Box height={6} background="border" borderRadius="sm" overflow="hidden">
              <Box height="100%" width={`${progress}%`} background={stripColor} />
            </Box>
          </Stack>
        </AppCard>
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
        <View style={styles.emptyState}>
          <AppIcon name="pieChart" size={64} color={theme.border} />
          <AppText variant="subheading" color="secondary" style={{ marginTop: Spacing.md }}>
            No budgets yet
          </AppText>
        </View>
      }
      contentContainerStyle={styles.listContainer}
    />
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: Shape.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  statColumn: {
    justifyContent: 'center',
  },
  remainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: Shape.radius.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  listContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xxxl,
  },
});
