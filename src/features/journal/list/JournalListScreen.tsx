import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { AppText, FloatingActionButton } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
// Direct import to avoid require cycle through dashboard/index.ts (which exports DashboardScreen)
import { DashboardHeader } from '@/src/features/dashboard/components/DashboardHeader';
import { useSummary } from '@/src/features/dashboard/hooks/useSummary';
import { JournalCard } from '@/src/features/journal/components/JournalCard';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { EnrichedJournal } from '@/src/types/domain';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function JournalListScreen() {
    const router = useRouter()
    const { userName } = useUI()
    const { theme } = useTheme();
    const [searchQuery, setSearchQuery] = React.useState('')

    // Date range filter state (from shared hook)
    const {
        dateRange,
        periodFilter,
        isPickerVisible: isDatePickerVisible,
        showPicker: showDatePicker,
        hidePicker: hideDatePicker,
        setFilter,
        navigatePrevious,
        navigateNext,
    } = useDateRangeFilter({ defaultToCurrentMonth: true });

    const { journals, isLoading, isLoadingMore, loadMore } = useJournals(50, dateRange || undefined)
    const { income, expense, netWorth, totalAssets, totalLiabilities, isPrivacyMode, isLoading: isSummaryLoading } = useSummary()
    const [isDashboardHidden, setIsDashboardHidden] = React.useState(isPrivacyMode)

    // Sync with global privacy mode when it changes
    React.useEffect(() => {
        setIsDashboardHidden(isPrivacyMode)
    }, [isPrivacyMode])

    const handleJournalPress = useCallback((journal: EnrichedJournal) => {
        router.push(`/transaction-details?journalId=${journal.id}`);
    }, [router]);

    const greeting = useMemo(() => `Hello, ${userName || 'there'}!`, [userName]);

    // Filter journals based on search query
    const filteredJournals = useMemo(() => {
        if (!searchQuery) return journals;
        const q = searchQuery.toLowerCase();
        return journals.filter(j =>
            (j.description?.toLowerCase() || '').includes(q) ||
            (j.currencyCode.toLowerCase()).includes(q)
        );
    }, [journals, searchQuery]);

    // WORKAROUND: FlashList 2.0.2 types are currently incompatible with React 19/RN 0.81 JSX checks.
    // We use 'any' here to unblock the build while keeping the core logic intact.
    const TypedFlashList = FlashList as any;

    const ListEmpty = useMemo(() => (
        isLoading ? (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" />
                <AppText variant="body" color="secondary" style={{ marginTop: Spacing.sm }}>
                    Loading journals...
                </AppText>
            </View>
        ) : (
            <View style={styles.emptyContainer}>
                <AppText variant="heading" style={styles.emptyText}>
                    No transactions yet
                </AppText>
                <AppText
                    variant="body"
                    color="secondary"
                    style={styles.emptySubtext}
                >
                    Tap the + button to add your first transaction
                </AppText>
            </View>
        )
    ), [isLoading]);

    const ListFooter = useMemo(() => (
        isLoadingMore ? (
            <View style={styles.loadingMore}>
                <ActivityIndicator size="small" />
                <AppText variant="caption" color="secondary">
                    Loading more...
                </AppText>
            </View>
        ) : null
    ), [isLoadingMore]);

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <TypedFlashList
                data={filteredJournals}
                renderItem={({ item }: { item: EnrichedJournal }) => (
                    <JournalCard
                        journal={item}
                        onPress={handleJournalPress}
                    />
                )}
                keyExtractor={(item: EnrichedJournal) => item.id}
                estimatedItemSize={120}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <DashboardHeader
                        greeting={greeting}
                        netWorth={netWorth}
                        totalAssets={totalAssets}
                        totalLiabilities={totalLiabilities}
                        isSummaryLoading={isSummaryLoading}
                        isDashboardHidden={isDashboardHidden}
                        onToggleHidden={setIsDashboardHidden}
                        income={income}
                        expense={expense}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        dateRange={dateRange}
                        showDatePicker={showDatePicker}
                        navigatePrevious={navigatePrevious}
                        navigateNext={navigateNext}
                    />
                }
                ListEmptyComponent={ListEmpty}
                ListFooterComponent={ListFooter}
                onEndReached={!searchQuery ? loadMore : undefined}
                onEndReachedThreshold={0.5}
            />
            <FloatingActionButton
                onPress={() => router.push('/journal-entry' as any)}
            />
            <DateRangePicker
                visible={isDatePickerVisible}
                onClose={hideDatePicker}
                currentFilter={periodFilter}
                onSelect={(range, filter) => {
                    setFilter(range, filter)
                    hideDatePicker()
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContent: {
        padding: Spacing.lg,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: Spacing.xxxxl * 2,
    },
    emptyText: {
        marginBottom: Spacing.sm,
    },
    emptySubtext: {
        textAlign: 'center',
    },
    loadingMore: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: Spacing.lg,
        gap: Spacing.sm,
    },
});
