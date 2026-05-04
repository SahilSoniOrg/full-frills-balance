import { AppIcon } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { Column, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { useBudgetListViewModel } from '../hooks/useBudgetListViewModel';
import { BudgetItem } from '../types';
import { BudgetCard } from './BudgetCard';

export function BudgetListView() {
  const { workplaceId } = useWorkplace();
  const { items } = useBudgetListViewModel(workplaceId);
  const { theme } = useTheme();

  const handlePress = (item: BudgetItem) => {
    AppNavigation.toBudgetDetail(item.budget.id, {
      name: item.budget.name,
      amount: item.budget.amount,
      currency: item.budget.currencyCode,
    });
  };

  const renderItem = ({ item }: { item: BudgetItem }) => {
    return <BudgetCard item={item} onPress={handlePress} />;
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
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.xxxl,
      }}
    />
  );
}
