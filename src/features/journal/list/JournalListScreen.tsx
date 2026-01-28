import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { AppText, FloatingActionButton, SearchField } from '@/src/components/core';
import { Opacity, Spacing, Typography } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { NetWorthCard, useSummary } from '@/src/features/dashboard';
import { DashboardSummary } from '@/src/features/journal/components/DashboardSummary';
import { JournalCard } from '@/src/features/journal/components/JournalCard';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useTheme } from '@/src/hooks/use-theme';
import { EnrichedJournal } from '@/src/types/domain';
import { DateRange, PeriodFilter, getCurrentMonthRange, getNextMonthRange, getPreviousMonthRange } from '@/src/utils/dateUtils';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function JournalListScreen() {
    const router = useRouter()
    const { userName } = useUI()
    const { theme } = useTheme();
    const [searchQuery, setSearchQuery] = React.useState('')

    // Default to Current Month
    const [dateRange, setDateRange] = React.useState<DateRange | null>(() => getCurrentMonthRange())
    const [periodFilter, setPeriodFilter] = React.useState<PeriodFilter>(() => {
        const now = new Date();
        return { type: 'MONTH', month: now.getMonth(), year: now.getFullYear() };
    })
    const [isDatePickerVisible, setIsDatePickerVisible] = React.useState(false)
    const { journals, isLoading, isLoadingMore, hasMore, loadMore } = useJournals(50, dateRange || undefined)
    const { income, expense, netWorth, totalAssets, totalLiabilities, isPrivacyMode, isLoading: isSummaryLoading } = useSummary()
    const [isDashboardHidden, setIsDashboardHidden] = React.useState(isPrivacyMode)

    // Sync with global privacy mode when it changes
    React.useEffect(() => {
        setIsDashboardHidden(isPrivacyMode)
    }, [isPrivacyMode])

    const handleMonthNavigation = (direction: 'PREV' | 'NEXT') => {
        if (periodFilter.type === 'MONTH' && periodFilter.month !== undefined && periodFilter.year !== undefined) {
            const { range, month, year } = direction === 'PREV'
                ? getPreviousMonthRange(periodFilter.month, periodFilter.year)
                : getNextMonthRange(periodFilter.month, periodFilter.year);

            setDateRange(range);
            setPeriodFilter({ type: 'MONTH', month, year });
        }
    };

    // WORKAROUND: FlashList 2.0.2 types are currently incompatible with React 19/RN 0.81 JSX checks.
    // We use 'any' here to unblock the build while keeping the core logic intact.
    const TypedFlashList = FlashList as any

    const handleJournalPress = (journal: EnrichedJournal) => {
        router.push(`/transaction-details?journalId=${journal.id}`);
    }

    // Filter journals based on search query
    const filteredJournals = journals.filter(j => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (j.description?.toLowerCase() || '').includes(q) ||
            (j.currencyCode.toLowerCase()).includes(q)
        );
    });

    if (isLoading) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <View style={styles.loadingContainer}>
                    <AppText variant="body">Loading journals...</AppText>
                </View>
            </View>
        );
    }

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
                    <>
                        <View style={{ marginBottom: Spacing.lg }}>
                            <AppText variant="title">
                                Hello, {userName || 'there'}!
                            </AppText>
                            <AppText variant="body" color="secondary">
                                Here&apos;s your financial overview
                            </AppText>
                        </View>
                        <NetWorthCard
                            netWorth={netWorth}
                            totalAssets={totalAssets}
                            totalLiabilities={totalLiabilities}
                            isLoading={isSummaryLoading}
                            hidden={isDashboardHidden}
                            onToggleHidden={setIsDashboardHidden}
                        />
                        <DashboardSummary
                            income={income}
                            expense={expense}
                            isHidden={isDashboardHidden}
                        />
                        <SearchField
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        <DateRangeFilter
                            range={dateRange}
                            onPress={() => setIsDatePickerVisible(true)}
                            onPrevious={periodFilter.type === 'MONTH' ? () => handleMonthNavigation('PREV') : undefined}
                            onNext={periodFilter.type === 'MONTH' ? () => handleMonthNavigation('NEXT') : undefined}
                        />
                        <AppText variant="subheading" style={styles.sectionTitle}>
                            {searchQuery ? 'Search Results' : 'Recent Transactions'}
                        </AppText>
                    </>
                }
                ListEmptyComponent={
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
                }
                ListFooterComponent={
                    isLoadingMore ? (
                        <View style={styles.loadingMore}>
                            <ActivityIndicator size="small" />
                            <AppText variant="caption" color="secondary">
                                Loading more...
                            </AppText>
                        </View>
                    ) : null
                }
                onEndReached={!searchQuery ? loadMore : undefined}
                onEndReachedThreshold={0.5}
            />
            <FloatingActionButton
                onPress={() => router.push('/journal-entry' as any)}
            />
            <DateRangePicker
                visible={isDatePickerVisible}
                onClose={() => setIsDatePickerVisible(false)}
                currentFilter={periodFilter}
                onSelect={(range, filter) => {
                    setDateRange(range)
                    setPeriodFilter(filter)
                    setIsDatePickerVisible(false)
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
        marginTop: Spacing.sm,
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
        fontSize: Typography.sizes.lg,
        fontFamily: Typography.fonts.bold,
        marginBottom: Spacing.sm,
    },
    emptySubtext: {
        fontSize: Typography.sizes.sm,
        opacity: Opacity.medium,
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
