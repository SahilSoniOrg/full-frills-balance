import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { AppText, ExpandableSearchButton } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { NetWorthCard } from '@/src/features/dashboard/components/NetWorthCard';
import { DashboardSummary } from '@/src/features/journal/components/DashboardSummary';
import { DateRange } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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
    dateRange: DateRange | null;
    showDatePicker: () => void;
    navigatePrevious?: () => void;
    navigateNext?: () => void;
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
    dateRange,
    showDatePicker,
    navigatePrevious,
    navigateNext,
}: DashboardHeaderProps) {
    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <View style={styles.greetingContainer}>
                    <AppText variant="title" numberOfLines={1}>
                        {greeting}
                    </AppText>
                </View>

                <View style={styles.headerActions}>
                    <DateRangeFilter
                        range={dateRange}
                        onPress={showDatePicker}
                        onPrevious={navigatePrevious}
                        onNext={navigateNext}
                        showNavigationArrows={false}
                        style={styles.dateFilter}
                    />

                    <ExpandableSearchButton
                        value={searchQuery}
                        onChangeText={onSearchChange}
                        placeholder="Search..."
                    />
                </View>
            </View>

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

            <AppText variant="subheading" style={styles.sectionTitle}>
                {searchQuery ? 'Search Results' : 'Recent Transactions'}
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
        gap: Spacing.sm,
    },
    greetingContainer: {
        flex: 1,
        minWidth: 0, // Allow shrinking
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        flexShrink: 0,
    },
    dateFilter: {
        marginBottom: 0,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
        marginTop: Spacing.sm,
    },
});
