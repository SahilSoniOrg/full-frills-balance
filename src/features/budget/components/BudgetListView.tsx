import { AppText, EmptyStateView, ErrorStateView, LoadingView } from '@/src/components/core';
import { IncompleteFxWarning } from '@/src/components/shared/IncompleteFxWarning';
import type { MissingRateQuote } from '@/src/services/reports-v2/types/result';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';
import { BudgetItem } from '../types';
import { BudgetCard } from './BudgetCard';
import { BudgetListSummary } from './BudgetListSummary';
import { summarizeBudgetList } from '../helpers/budgetListPresentation';
import { Column } from '@/src/design-system';

export type BudgetListViewProps = {
  items: BudgetItem[];
  summary?: ReturnType<typeof summarizeBudgetList>;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onItemPress: (item: BudgetItem) => void;
  onCreate?: () => void;
  /** Historical rates some spending still needs; opens the shared FX sheet. */
  missingRateQuotes?: MissingRateQuote[];
};

export function BudgetListView({
  items,
  summary,
  isLoading,
  error,
  onRetry,
  onItemPress,
  onCreate,
  missingRateQuotes = [],
}: BudgetListViewProps) {
  if (error && items.length === 0) {
    return (
      <ErrorStateView
        message={AppConfig.strings.commitmentsRedesign.budgetsLoadError}
        onRetry={onRetry}
      />
    );
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
      ListHeaderComponent={
        items.length > 0 ? (
          <Column gap="md" marginBottom="sm">
            {missingRateQuotes.length > 0 && (
              <IncompleteFxWarning
                testID="budgets-missing-rates"
                message={AppConfig.strings.reportsV2.incompleteFxWarning}
                onPress={() =>
                  showIncompleteFxDetails({
                    context: 'budget',
                    currencyCode: summary?.currencyCode ?? '',
                    missingRateQuotes,
                  })
                }
              />
            )}
            {summary && <BudgetListSummary summary={summary} />}
            <AppText variant="body" color="secondary" weight="semibold">
              {AppConfig.strings.commitmentsRedesign.thisMonth}
            </AppText>
          </Column>
        ) : undefined
      }
      ListEmptyComponent={
        <EmptyStateView
          title={AppConfig.strings.budget.emptyTitle}
          subtitle={AppConfig.strings.budget.emptySubtitle}
          primaryActionLabel={onCreate ? AppConfig.strings.budget.emptyActionLabel : undefined}
          onPrimaryAction={onCreate}
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
    paddingTop: Spacing.sm,
    paddingBottom: Size.fab + Spacing.xl + Spacing.xxxl * 2,
  },
  emptyState: {
    marginTop: Spacing.xxxl,
  },
});
