import { EmptyStateView, LoadingView } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';
import { BudgetItem } from '../types';
import { BudgetCard } from './BudgetCard';
import { AppNavigation } from '@/src/utils/navigation';

export type BudgetListViewProps = {
  items: BudgetItem[];
  isLoading: boolean;
};

export function BudgetListView({ items, isLoading }: BudgetListViewProps) {
  if (isLoading && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingView loading={true} text={AppConfig.strings.common.loading} />
      </View>
    );
  }

  const handlePress = (item: BudgetItem) => {
    AppNavigation.toBudgetDetail(item.budget.id, {
      name: item.budget.name,
      amount: item.budget.amount,
      currency: item.budget.currencyCode,
    });
  };

  return (
    <FlashList
      data={items}
      keyExtractor={item => item.budget.id}
      renderItem={({ item }) => <BudgetCard item={item} onPress={handlePress} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <EmptyStateView
          title={AppConfig.strings.budget.emptyTitle}
          subtitle={AppConfig.strings.budget.emptySubtitle}
          icon="pieChart"
          style={styles.emptyState}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  emptyState: {
    marginTop: Spacing.xxxl,
  },
});
