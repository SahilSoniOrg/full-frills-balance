import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { AppText, ExpandableSearchButton } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { DashboardSummary } from '@/src/features/dashboard/components/DashboardSummary';
import { NetWorthCard } from '@/src/features/dashboard/components/NetWorthCard';
import { DateRange } from '@/src/utils/dateUtils';
import React from 'react';
import { LayoutAnimation, StyleSheet, View } from 'react-native';

interface DashboardHeaderProps {
    greeting: string;
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    isSummaryLoading: boolean;
    isDashboardHidden: boolean;
    onToggleHidden: (hidden: boolean) => void;
    income: number;
    expense: number;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onSearchPress: () => void;
    dateRange: DateRange | null;
    showDatePicker: () => void;
    navigatePrevious?: () => void;
    navigateNext?: () => void;
    sectionTitle: string;
}

export function DashboardHeader({
    greeting,
    netWorth,
    totalAssets,
    totalLiabilities,
    isSummaryLoading,
    isDashboardHidden,
    onToggleHidden,
    income,
    expense,
    searchQuery,
    onSearchChange,
    onSearchPress,
    dateRange,
    showDatePicker,
    navigatePrevious,
    navigateNext,
    sectionTitle,
}: DashboardHeaderProps) {
    const [isSearching, setIsSearching] = React.useState(false);

    const handleSearchExpand = React.useCallback((expanded: boolean) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsSearching(expanded);
    }, []);

    return (
        <View style={styles.container}>
            <View style={[styles.headerRow, isSearching && { gap: 0 }]}>
                {!isSearching && (
                    <View style={styles.greetingContainer}>
                        <AppText variant="title" numberOfLines={1}>
                            {greeting}
                        </AppText>
                    </View>
                )}

                <View style={[styles.headerActions, isSearching && styles.expandedActions]}>
                    {searchQuery.length === 0 && (
                        <DateRangeFilter
                            range={dateRange}
                            onPress={showDatePicker}
                            onPrevious={navigatePrevious}
                            onNext={navigateNext}
                            showNavigationArrows={false}
                        />
                    )}

                    <View style={styles.searchWrapper}>
                        <ExpandableSearchButton
                            value={searchQuery}
                            onChangeText={onSearchChange}
                            onExpandChange={handleSearchExpand}
                            onPress={onSearchPress}
                        />
                    </View>
                </View>
            </View>

            {!isSearching && (
                <>
                    <NetWorthCard
                        netWorth={netWorth}
                        totalAssets={totalAssets}
                        totalLiabilities={totalLiabilities}
                        isLoading={isSummaryLoading}
                        hidden={isDashboardHidden}
                        onToggleHidden={onToggleHidden}
                    />

                    <DashboardSummary
                        income={income}
                        expense={expense}
                        isHidden={isDashboardHidden}
                    />
                </>
            )}

            <AppText variant="subheading" style={styles.sectionTitle}>
                {sectionTitle}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.sm,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.lg,
        gap: Spacing.md,
    },
    greetingContainer: {
        flex: 1,
        minWidth: 0,
        marginRight: Spacing.sm,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    searchWrapper: {
        flexShrink: 0,
    },
    expandedActions: {
        flex: 1,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
        marginTop: Spacing.sm,
    },
});
