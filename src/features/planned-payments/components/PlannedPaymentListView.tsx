import { EmptyStateView, LoadingView } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { PlannedPaymentCard } from '@/src/features/planned-payments/components/PlannedPaymentCard';
import { PlainPlannedPayment } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

export type PlannedPaymentListViewProps = {
  items: PlainPlannedPayment[];
  isLoading: boolean;
};

export function PlannedPaymentListView({ items, isLoading }: PlannedPaymentListViewProps) {
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
        <PlannedPaymentCard
          item={item}
          onPress={() =>
            AppNavigation.toPlannedPaymentDetails(item.id, {
              description: item.name,
              amount: item.amount,
              currency: item.currencyCode,
              nextDate: item.nextOccurrence,
            })
          }
        />
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
