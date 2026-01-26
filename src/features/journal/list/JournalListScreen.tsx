import { Opacity, Spacing, Typography } from '@/constants';
import { AppText, FloatingActionButton, SearchField } from '@/src/components/core';
import { useUI } from '@/src/contexts/UIContext';
import { NetWorthCard } from '@/src/features/dashboard';
import { DashboardSummary } from '@/src/features/journal/components/DashboardSummary';
import { JournalCard } from '@/src/features/journal/components/JournalCard';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { useSummary } from '@/src/hooks/use-summary';
import { useTheme } from '@/src/hooks/use-theme';
import { EnrichedJournal } from '@/src/types/domain';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function JournalListScreen() {
    const router = useRouter()
    const { userName } = useUI()
    const { theme } = useTheme();
    const { journals, isLoading, isLoadingMore, loadMore } = useJournals()
    const { income, expense, netWorth, totalAssets, totalLiabilities, isPrivacyMode, isLoading: isSummaryLoading } = useSummary()
    const [searchQuery, setSearchQuery] = React.useState('')
    const [isDashboardHidden, setIsDashboardHidden] = React.useState(isPrivacyMode)

    // Sync with global privacy mode when it changes
    React.useEffect(() => {
        setIsDashboardHidden(isPrivacyMode)
    }, [isPrivacyMode])

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
        paddingTop: 100,
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
