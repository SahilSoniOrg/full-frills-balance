import { MultiAccountPickerModal } from '@/src/features/accounts';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { DateRangeTrigger } from '@/src/components/common/DateRangeTrigger';
import {
  AppInput,
  AppSegmentedControl,
  AppText,
  FilterChipButton,
  IconButton,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import type { ScreenChrome } from '@/src/components/layout';
import type { JournalSearchViewModel } from '@/src/features/journal/list/hooks/useJournalSearchViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

type JournalSearchViewProps = JournalSearchViewModel & {
  chrome: ScreenChrome;
};

export function JournalSearchView({ chrome, ...vm }: JournalSearchViewProps) {
  const { theme } = useTheme();

  const filterHeader = useMemo(
    () => (
      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          <AppInput
            placeholder="Search description or notes..."
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
            containerStyle={styles.searchInput}
            leftIcon="search"
            autoFocus
          />
        </View>

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
              icon="wallet"
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
          <AppInput
            placeholder="Min Amount"
            value={vm.minAmount}
            onChangeText={vm.setMinAmount}
            keyboardType="numeric"
            containerStyle={styles.amountInput}
          />
          <AppText variant="caption" style={{ color: theme.textSecondary }}>
            to
          </AppText>
          <AppInput
            placeholder="Max Amount"
            value={vm.maxAmount}
            onChangeText={vm.setMaxAmount}
            keyboardType="numeric"
            containerStyle={styles.amountInput}
          />
          {(vm.searchQuery ||
            vm.accountIds.length > 0 ||
            vm.dateRange ||
            vm.minAmount ||
            vm.maxAmount ||
            vm.displayType) && (
            <IconButton
              name="close"
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
          loadingText: AppConfig.strings.common.loading,
          loadingMoreText: AppConfig.strings.common.loading,
          emptyTitle: 'No transactions found',
          emptySubtitle: 'Try adjusting your filters',
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipContainer: {
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
  },
  amountRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  amountInput: {
    flex: 1,
  },
  clearButton: {
    marginLeft: 'auto',
  },
});
