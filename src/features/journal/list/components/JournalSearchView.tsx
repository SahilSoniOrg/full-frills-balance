import { MultiAccountPickerModal } from '@/src/components/account-selection';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { DateRangePicker } from '@/src/components/filters/DateRangePicker';
import { DateRangeTrigger } from '@/src/components/filters/DateRangeTrigger';
import {
  Icon,
  AppSegmentedControl,
  AppText,
  FilterChipButton,
  IconButton,
  PressScaleTouchable,
  SearchField,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { transactionCaptureStrings as captureCopy } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import type { ScreenNavChrome } from '@/src/components/layout';
import type { JournalSearchViewModel } from '@/src/features/journal/list/hooks/useJournalSearchViewModel';
import { Inline } from '@/src/design-system';
import { useMemo } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

type JournalSearchViewProps = JournalSearchViewModel & {
  chrome: ScreenNavChrome;
};

const searchCopy = AppConfig.strings.journal.search;

export function JournalSearchView({ chrome, ...vm }: JournalSearchViewProps) {
  const {
    attachMode,
    reportScopeLabel,
    clearReportScope,
    searchQuery,
    setSearchQuery,
    dateRange,
    openDatePicker,
    accountIds,
    openAccountPicker,
    displayType,
    setDisplayType,
    minAmount,
    setMinAmount,
    maxAmount,
    setMaxAmount,
    clearFilters,
  } = vm;
  const accountCount = accountIds.length;
  const filterHeader = useMemo(
    () => (
      <View style={styles.filterContainer} testID="journal-search-screen">
        {attachMode ? (
          <AppText variant="caption" color="secondary" testID="journal-search-attach-hint">
            {captureCopy.attachToJournalHint}
          </AppText>
        ) : null}
        {reportScopeLabel ? (
          <Inline
            align="center"
            justify="space-between"
            gap="sm"
            paddingHorizontal="sm"
            paddingVertical="xs"
          >
            <AppText variant="caption" weight="semibold" style={styles.reportScopeLabel}>
              {searchCopy.reportScopeLabel(reportScopeLabel)}
            </AppText>
            <PressScaleTouchable
              accessibilityRole="button"
              accessibilityLabel={searchCopy.clearReportScopeA11y}
              testID="journal-search-clear-report-scope"
              onPress={clearReportScope}
              hitSlop={Spacing.sm}
            >
              <AppText variant="caption" color="primary" weight="semibold">
                {searchCopy.clearReportScope}
              </AppText>
            </PressScaleTouchable>
          </Inline>
        ) : null}
        <SearchField
          placeholder={searchCopy.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
          testID="journal-search-input"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContainer}
          keyboardShouldPersistTaps="always"
        >
          <DateRangeTrigger
            range={dateRange}
            onPress={() => {
              Keyboard.dismiss();
              openDatePicker();
            }}
            showNavigationArrows={false}
          />

          <FilterChipButton
            label={
              accountCount > 0 ? searchCopy.accountsCount(accountCount) : searchCopy.allAccounts
            }
            icon={Icon.Wallet}
            isActive={accountCount > 0}
            onPress={() => {
              Keyboard.dismiss();
              openAccountPicker();
            }}
          />

          <AppSegmentedControl
            options={[
              { label: 'All', id: '' },
              { label: 'Income', id: 'INCOME' },
              { label: 'Expense', id: 'EXPENSE' },
              { label: 'Transfer', id: 'TRANSFER' },
            ]}
            value={displayType}
            onChange={val => {
              Keyboard.dismiss();
              setDisplayType(val);
            }}
          />
        </ScrollView>

        <Inline align="center" gap="sm">
          <CalculatorAmountInput
            placeholder={searchCopy.minAmount}
            value={minAmount}
            onChangeText={setMinAmount}
            containerStyle={{ flex: 1 }}
            testID="journal-search-min-amount"
          />
          <AppText variant="caption" color="secondary">
            {searchCopy.amountRangeTo}
          </AppText>
          <CalculatorAmountInput
            placeholder={searchCopy.maxAmount}
            value={maxAmount}
            onChangeText={setMaxAmount}
            containerStyle={{ flex: 1 }}
            testID="journal-search-max-amount"
          />
          {(searchQuery ||
            accountCount > 0 ||
            dateRange ||
            minAmount ||
            maxAmount ||
            displayType ||
            reportScopeLabel) && (
            <IconButton
              name={Icon.Close}
              size={Size.iconXs}
              onPress={clearFilters}
              accessibilityLabel={AppConfig.strings.common.clearFilters}
              style={styles.clearButton}
            />
          )}
        </Inline>
      </View>
    ),
    [
      accountCount,
      attachMode,
      clearFilters,
      clearReportScope,
      dateRange,
      displayType,
      maxAmount,
      minAmount,
      openAccountPicker,
      openDatePicker,
      reportScopeLabel,
      searchQuery,
      setDisplayType,
      setMaxAmount,
      setMinAmount,
      setSearchQuery,
    ],
  );

  return (
    <>
      <JournalListView
        list={{
          items: vm.items,
          isLoading: vm.isLoading,
          isLoadingMore: vm.isLoadingMore,
          error: vm.error,
          retry: vm.retry,
          loadingMoreText: AppConfig.strings.common.loading,
          emptyTitle: searchCopy.emptyTitle,
          emptySubtitle: searchCopy.emptySubtitle,
          onEndReached: vm.onEndReached,
          listHeader: filterHeader,
          // Search is a pushed nav screen — no tab bar; override tab-list inset.
          listContentStyle: styles.searchListContent,
        }}
        chrome={chrome}
        selection={vm.selection}
        modals={vm.modals}
      />

      <MultiAccountPickerModal
        visible={vm.isAccountPickerVisible}
        onClose={vm.closeAccountPicker}
        selectedIds={vm.accountIds}
        onSelect={vm.setAccountIds}
        accounts={vm.accounts}
        title={searchCopy.filterByAccounts}
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
  reportScopeLabel: {
    flex: 1,
  },
  chipContainer: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  clearButton: {
    marginLeft: 'auto',
  },
  searchListContent: {
    paddingBottom: Spacing.xxl,
  },
});
