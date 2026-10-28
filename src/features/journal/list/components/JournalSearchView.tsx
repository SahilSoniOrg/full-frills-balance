import { MultiAccountPickerModal } from '@/src/components/account-selection';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { DateRangeTrigger } from '@/src/components/filters/DateRangeTrigger';
import {
  Icon,
  AppInput,
  AppSegmentedControl,
  AppText,
  FilterChipButton,
  IconButton,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import type { ScreenNavChrome } from '@/src/components/layout';
import type { JournalSearchViewModel } from '@/src/features/journal/list/hooks/useJournalSearchViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

type JournalSearchViewProps = JournalSearchViewModel & {
  chrome: ScreenNavChrome;
};

export function JournalSearchView({ chrome, ...vm }: JournalSearchViewProps) {
  const { theme } = useTheme();

  const filterHeader = useMemo(
    () => (
      <View style={styles.filterContainer}>
        {vm.reportScopeLabel ? (
          <View style={styles.reportScopeRow}>
            <AppText variant="caption" weight="semibold" style={styles.reportScopeLabel}>
              Report drill-down · {vm.reportScopeLabel}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear report drill-down scope"
              testID="journal-search-clear-report-scope"
              onPress={vm.clearReportScope}
              hitSlop={8}
            >
              <AppText variant="caption" color="primary" weight="semibold">
                Clear scope
              </AppText>
            </Pressable>
          </View>
        ) : null}
        <AppInput
          placeholder="Search description or notes..."
          value={vm.searchQuery}
          onChangeText={vm.setSearchQuery}
          leftIcon={Icon.Search}
          autoFocus
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContainer}
          keyboardShouldPersistTaps="always"
        >
          <DateRangeTrigger
            range={vm.dateRange}
            onPress={() => {
              Keyboard.dismiss();
              vm.openDatePicker();
            }}
            showNavigationArrows={false}
          />

          <View style={{ marginLeft: Spacing.sm }}>
            <FilterChipButton
              label={vm.accountIds.length > 0 ? `${vm.accountIds.length} Accounts` : 'All Accounts'}
              icon={Icon.Wallet}
              isActive={vm.accountIds.length > 0}
              onPress={() => {
                Keyboard.dismiss();
                vm.openAccountPicker();
              }}
            />
          </View>

          <View style={{ marginLeft: Spacing.sm }}>
            <AppSegmentedControl
              options={[
                { label: 'All', id: '' },
                { label: 'Income', id: 'INCOME' },
                { label: 'Expense', id: 'EXPENSE' },
                { label: 'Transfer', id: 'TRANSFER' },
              ]}
              value={vm.displayType}
              onChange={val => {
                Keyboard.dismiss();
                vm.setDisplayType(val);
              }}
            />
          </View>
        </ScrollView>

        <View style={styles.amountRangeRow}>
          <CalculatorAmountInput
            placeholder="Min Amount"
            value={vm.minAmount}
            onChangeText={vm.setMinAmount}
            containerStyle={{ flex: 1 }}
            testID="journal-search-min-amount"
          />
          <AppText variant="caption" style={{ color: theme.textSecondary }}>
            to
          </AppText>
          <CalculatorAmountInput
            placeholder="Max Amount"
            value={vm.maxAmount}
            onChangeText={vm.setMaxAmount}
            containerStyle={{ flex: 1 }}
            testID="journal-search-max-amount"
          />
          {(vm.searchQuery ||
            vm.accountIds.length > 0 ||
            vm.dateRange ||
            vm.minAmount ||
            vm.maxAmount ||
            vm.displayType ||
            vm.reportScopeLabel) && (
            <IconButton
              name={Icon.Close}
              size={Size.iconXs}
              onPress={vm.clearFilters}
              style={styles.clearButton}
            />
          )}
        </View>
      </View>
    ),
    [vm, theme],
  );

  return (
    <>
      <JournalListView
        list={{
          items: vm.items,
          isLoading: vm.isLoading,
          isLoadingMore: vm.isLoadingMore,
          loadingMoreText: AppConfig.strings.common.loading,
          emptyTitle: 'No entries found',
          emptySubtitle: 'Try adjusting your filters or search terms',
          onEndReached: vm.onEndReached,
          listHeader: filterHeader,
        }}
        chrome={chrome}
        selection={{
          selectedIds: vm.selectedIds,
          isSelectionModeActive: vm.isSelectionModeActive,
          onLongPressItem: vm.onLongPressItem,
          toggleSelection: vm.toggleSelection,
          selectAll: vm.selectAll,
          clearItems: vm.clearItems,
          exitSelectionMode: vm.exitSelectionMode,
          onShareSelected: vm.onShareSelected,
          actions: vm.actions,
        }}
        modals={vm.modals}
      />

      <MultiAccountPickerModal
        visible={vm.isAccountPickerVisible}
        onClose={vm.closeAccountPicker}
        selectedIds={vm.accountIds}
        onSelect={vm.setAccountIds}
        accounts={vm.accounts}
        title="Filter by Accounts"
      />

      <DateRangePicker
        visible={vm.isDatePickerVisible}
        onClose={vm.closeDatePicker}
        currentFilter={vm.periodFilter}
        onSelect={vm.setDateRange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  filterContainer: {
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  reportScopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  reportScopeLabel: {
    flex: 1,
  },
  chipContainer: {
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  amountRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  clearButton: {
    marginLeft: 'auto',
  },
});
