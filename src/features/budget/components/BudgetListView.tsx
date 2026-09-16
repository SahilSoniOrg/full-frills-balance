import { EmptyStateView, ErrorStateView, LoadingView } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';
import { BudgetItem } from '../types';
import { BudgetCard } from './BudgetCard';

export type BudgetListViewProps = {
  items: BudgetItem[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onItemPress: (item: BudgetItem) => void;
};

export function BudgetListView({
  items,
  isLoading,
  error,
  onRetry,
  onItemPress,
}: BudgetListViewProps) {
  if (error && items.length === 0) {
    return <ErrorStateView message="We could not load budgets." onRetry={onRetry} />;
  }

  if (isLoading && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingView loading={true} text={AppConfig.strings.common.loading} />
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={item => item.budget.id}
      renderItem={({ item }) => <BudgetCard item={item} onPress={onItemPress} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <EmptyStateView
          title={AppConfig.strings.budget.emptyTitle}
          subtitle={AppConfig.strings.budget.emptySubtitle}
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
