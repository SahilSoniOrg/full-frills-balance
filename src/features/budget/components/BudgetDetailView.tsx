import { JournalEntryListView } from '@/src/components/common/JournalEntryListView';
import { LoadingView } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig, Spacing } from '@/src/constants';
import { JournalListModals } from '@/src/features/journal';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BudgetDetailHeader } from '../components/BudgetDetailHeader';
import type { BudgetDetailViewModel } from '../hooks/useBudgetDetailViewModel';

export function BudgetDetailView({
  chrome,
  ...vm
}: BudgetDetailViewModel & { chrome: ScreenNavChrome }) {
  const { budget, usage } = vm;

  const selectionChrome = useMemo(
    () => ({
      exitSelectionMode: vm.exitSelectionMode,
      selectAll: vm.selectAll,
      clearItems: vm.clearItems,
      onShareSelected: vm.onShareSelected,
      actions: vm.actions,
    }),
    [vm.exitSelectionMode, vm.selectAll, vm.clearItems, vm.onShareSelected, vm.actions],
  );

  if (vm.isLoading || !budget || !usage) {
    return (
      <ScreenWithChrome chrome={chrome}>
        <LoadingView loading={true} text={AppConfig.strings.budget.loading} size="large" />
      </ScreenWithChrome>
    );
  }

  return (
    <ScreenWithChrome chrome={chrome}>
      <View style={styles.container}>
        <JournalEntryListView
          items={vm.items}
          isLoading={vm.isLoading}
          isLoadingMore={false}
          emptyTitle={AppConfig.strings.budget.activityEmptyTitle}
          emptySubtitle={AppConfig.strings.budget.activityEmptySubtitle}
          selectedIds={vm.selectedIds}
          onLongPressItem={vm.onLongPressItem}
          isSelectionModeActive={vm.isSelectionModeActive}
          selectionChrome={selectionChrome}
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
      {vm.modals ? <JournalListModals {...vm.modals} /> : null}
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
});
