import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { LoadingView } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BudgetDetailHeader } from '../components/BudgetDetailHeader';
import { useBudgetDetailViewModel } from '../hooks/useBudgetDetailViewModel';

export function BudgetDetailScreen() {
  const vm = useBudgetDetailViewModel();
  const { theme } = useTheme();

  if (vm.isLoading || !vm.budget || !vm.usage) {
    return (
      <Screen showBack backIcon="back">
        <LoadingView loading={true} text="Loading budget..." size="large" />
      </Screen>
    );
  }

  const { budget, usage } = vm;

  return (
    <Screen
      showBack
      backIcon="back"
      title="Budget Details"
      headerActions={
        <ScreenHeaderActions
          actions={[
            {
              name: 'edit',
              onPress: () =>
                AppNavigation.toBudgetForm(budget.id, {
                  name: budget.name,
                  amount: budget.amount,
                  currency: budget.currencyCode,
                }),
              iconColor: theme.text,
              size: Typography.sizes.xl,
              testID: 'edit-button',
            },
            {
              name: 'delete',
              onPress: vm.handleDelete,
              iconColor: theme.error,
              size: Typography.sizes.xl,
              testID: 'delete-button',
            },
          ]}
        />
      }
    >
      <View style={styles.container}>
        <TransactionListView
          items={vm.items}
          isLoading={vm.isLoading}
          isLoadingMore={false}
          emptyTitle="No activity"
          emptySubtitle="No transactions found for this budget in the selected month."
          ListHeaderComponent={
            <BudgetDetailHeader
              budget={budget}
              usage={usage}
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
    </Screen>
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
