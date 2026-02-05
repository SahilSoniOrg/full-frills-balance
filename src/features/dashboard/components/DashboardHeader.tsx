import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { AppIcon, AppText, ExpandableSearchButton } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { DashboardSummary } from '@/src/features/dashboard/components/DashboardSummary';
import { NetWorthCard } from '@/src/features/dashboard/components/NetWorthCard';
import { useTheme } from '@/src/hooks/use-theme';
import { DateRange } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

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
    isCollapsed: boolean;
    onToggleCollapse: () => void;
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
    dateRange,
    showDatePicker,
    navigatePrevious,
    navigateNext,
    isCollapsed,
    onToggleCollapse,
    sectionTitle,
}: DashboardHeaderProps) {
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <View style={styles.greetingContainer}>
                    <AppText variant="title" numberOfLines={1}>
                        {greeting}
                    </AppText>
                </View>

                <View style={styles.headerActions}>
                    <TouchableOpacity
                        onPress={onToggleCollapse}
                        hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
                        style={styles.collapseButton}
                    >
                        <AppIcon
                            name={isCollapsed ? 'chevronDown' : 'chevronUp'}
                            size={Size.sm}
                            color={theme.textSecondary}
                        />
                    </TouchableOpacity>

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

            {!isCollapsed && (
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
    collapseButton: {
        padding: Spacing.xs,
    },
    dateFilter: {
        marginBottom: 0,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
        marginTop: Spacing.sm,
    },
});
