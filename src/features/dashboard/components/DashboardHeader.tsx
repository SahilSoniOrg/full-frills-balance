import { FilterToolbar } from '@/src/components/common/FilterToolbar';
import { AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
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
    const [isSearching, setIsSearching] = React.useState(false);
    const wasExpandedBeforeSearch = React.useRef(!isCollapsed);

    const handleSearchExpand = React.useCallback((expanded: boolean) => {
        setIsSearching(expanded);
        if (expanded) {
            // Save current state and collapse
            wasExpandedBeforeSearch.current = !isCollapsed;
            if (!isCollapsed) {
                onToggleCollapse();
            }
        } else {
            // Restore saved state if it was expanded
            if (wasExpandedBeforeSearch.current && isCollapsed) {
                onToggleCollapse();
            }
        }
    }, [isCollapsed, onToggleCollapse]);

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
                    {!isSearching && (
                        <TouchableOpacity
                            onPress={onToggleCollapse}
                            hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
                            style={[styles.collapseButton, { backgroundColor: theme.surface }]}
                        >
                            <AppIcon
                                name={isCollapsed ? 'chevronDown' : 'chevronUp'}
                                size={Size.sm}
                                color={theme.textSecondary}
                            />
                        </TouchableOpacity>
                    )}

                    <FilterToolbar
                        searchQuery={searchQuery}
                        onSearchChange={onSearchChange}
                        dateRange={dateRange}
                        showDatePicker={showDatePicker}
                        navigatePrevious={navigatePrevious}
                        navigateNext={navigateNext}
                        onSearchExpandChange={handleSearchExpand}
                        style={isSearching ? styles.expandedToolbar : undefined}
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
    collapseButton: {
        width: Size.xxl,
        height: Size.xxl,
        borderRadius: Shape.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedActions: {
        flex: 1,
    },
    expandedToolbar: {
        flex: 1,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
        marginTop: Spacing.sm,
    },
});
