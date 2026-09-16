import { EmptyStateView, ErrorStateView, LoadingView } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { PlannedPaymentCard } from '@/src/features/planned-payments/components/PlannedPaymentCard';
import { PlainPlannedPayment } from '@/src/types/plainDtos';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

export type PlannedPaymentListViewProps = {
  items: PlainPlannedPayment[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onItemPress: (item: PlainPlannedPayment) => void;
};

export function PlannedPaymentListView({
  items,
  isLoading,
  error,
  onRetry,
  onItemPress,
}: PlannedPaymentListViewProps) {
  if (error && items.length === 0) {
    return <ErrorStateView message="We could not load planned payments." onRetry={onRetry} />;
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
      keyExtractor={item => item.id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <EmptyStateView
          title={AppConfig.strings.plannedPayments.emptyTitle}
          subtitle={AppConfig.strings.plannedPayments.emptySubtitle}
          style={styles.emptyState}
        />
      }
      renderItem={({ item }) => (
        <PlannedPaymentCard item={item} onPress={() => onItemPress(item)} />
      )}
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
