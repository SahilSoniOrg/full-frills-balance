import { AccountPickerModal } from '@/src/components/common/AccountPickerModal';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { AppButton, AppInput, AppSegmentedControl, AppText, IconButton } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { JournalListView } from '@/src/features/journal/components/JournalListView';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useJournalSearchViewModel } from '../hooks/useJournalSearchViewModel';

export default function JournalSearchScreen() {
    const vm = useJournalSearchViewModel();
    const { theme } = useTheme();
    const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

    const filterHeader = useMemo(() => (
        <View style={styles.filterContainer}>
            <View style={styles.filterRow}>
                <AppInput
                    placeholder="Search by description..."
                    value={vm.searchQuery}
                    onChangeText={vm.setSearchQuery}
                    containerStyle={styles.searchInput}
                    leftIcon="search"
                />
            </View>

            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                contentContainerStyle={styles.chipContainer}
            >
                <AppButton
                    variant="secondary"
                    size="sm"
                    onPress={() => setIsDatePickerVisible(true)}
                >
                    <AppText variant="caption">{vm.dateRange ? `${new Date(vm.dateRange.startDate).toLocaleDateString()} - ${new Date(vm.dateRange.endDate).toLocaleDateString()}` : "Any Time"}</AppText>
                </AppButton>

                <AppButton
                    variant="secondary"
                    size="sm"
                    onPress={() => setIsAccountPickerVisible(true)}
                >
                    <AppText variant="caption">{vm.accountIds.length > 0 ? `${vm.accountIds.length} Accounts` : "All Accounts"}</AppText>
                </AppButton>

                <AppSegmentedControl
                    options={[
                        { label: 'All', id: '' },
                        { label: 'Income', id: 'INCOME' },
                        { label: 'Expense', id: 'EXPENSE' },
                        { label: 'Transfer', id: 'TRANSFER' },
                    ]}
                    value={vm.displayType}
                    onChange={vm.setDisplayType}
                />
            </ScrollView>

            <View style={styles.amountRangeRow}>
                <AppInput
                    placeholder="Min Amount"
                    value={vm.minAmount}
                    onChangeText={vm.setMinAmount}
                    keyboardType="numeric"
                    containerStyle={styles.amountInput}
                />
                <AppText variant="caption" style={{ color: theme.textSecondary }}>to</AppText>
                <AppInput
                    placeholder="Max Amount"
                    value={vm.maxAmount}
                    onChangeText={vm.setMaxAmount}
                    keyboardType="numeric"
                    containerStyle={styles.amountInput}
                />
                {(vm.searchQuery || vm.accountIds.length > 0 || vm.dateRange || vm.minAmount || vm.maxAmount || vm.displayType) && (
                    <IconButton
                        name="close"
                        size={Size.iconXs}
                        onPress={vm.clearFilters}
                        style={styles.clearButton}
                    />
                )}
            </View>
        </View>
    ), [vm, setIsAccountPickerVisible, setIsDatePickerVisible, theme]);

    return (
        <>
            <JournalListView
                items={vm.items}
                isLoading={vm.isLoading}
                isLoadingMore={vm.isLoadingMore}
                loadingText={AppConfig.strings.common.loading}
                loadingMoreText={AppConfig.strings.common.loading}
                emptyTitle="No transactions found"
                emptySubtitle="Try adjusting your filters"
                onEndReached={vm.onEndReached}
                listHeader={filterHeader}
                screenTitle="Search"
                showBack={true}
                datePicker={{
                    visible: false,
                    onClose: () => {},
                    currentFilter: vm.periodFilter,
                    onSelect: () => {},
                }}
            />

            <AccountPickerModal
                visible={isAccountPickerVisible}
                onClose={() => setIsAccountPickerVisible(false)}
                multiple={true}
                selectedIds={vm.accountIds}
                onSelect={vm.setAccountIds}
                accounts={vm.accounts}
                title="Filter by Accounts"
            />

            <DateRangePicker
                visible={isDatePickerVisible}
                onClose={() => setIsDatePickerVisible(false)}
                currentFilter={vm.periodFilter}
                onSelect={(range, filter) => {
                    vm.setDateRange(range, filter);
                    setIsDatePickerVisible(false);
                }}
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
    }
});
