import { TransactionListView } from '@/src/components/common/TransactionListView';
import { LoadingView } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants';
import { StyleSheet, View } from 'react-native';
import { BudgetDetailHeader } from '../components/BudgetDetailHeader';
import type { useBudgetDetailViewModel } from '../hooks/useBudgetDetailViewModel';

type BudgetDetailViewModel = ReturnType<typeof useBudgetDetailViewModel>;

export function BudgetDetailView({
  chrome,
  ...vm
}: BudgetDetailViewModel & { chrome: ScreenNavChrome }) {
  const isLoading = vm.isLoading || !vm.budget || !vm.usage;

  return (
    <ScreenWithChrome chrome={chrome}>
      {isLoading ? (
        <LoadingView loading={true} text="Loading budget..." size="large" />
      ) : (
        <View style={styles.container}>
          <TransactionListView
            items={vm.items}
            isLoading={vm.isLoading}
            isLoadingMore={false}
            emptyTitle="No activity"
            emptySubtitle="No transactions found for this budget in the selected month."
            ListHeaderComponent={
              <BudgetDetailHeader
                budget={vm.budget!}
                usage={vm.usage!}
                periodLabel={vm.periodLabel}
                isCurrentMonth={vm.isCurrentMonth}
                chartData={vm.chartData}
                prevMonth={vm.prevMonth}
                nextMonth={vm.nextMonth}
                resetToToday={vm.resetToToday}
              />
            }
            contentContainerStyle={styles.listContent}
          />
        </View>
      )}
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
});
