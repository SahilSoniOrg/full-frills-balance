import { EmptyStateView, LoadingView } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { PlannedPaymentCard } from '@/src/features/planned-payments/components/PlannedPaymentCard';
import { usePlannedPayments } from '@/src/features/planned-payments/hooks/usePlannedPayments';
import { AppNavigation } from '@/src/utils/navigation';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

export function PlannedPaymentListView() {
  const { workplaceId } = useWorkplace();
  const { items, isLoading } = usePlannedPayments(workplaceId);

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
