import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { ExpandableSearchButton } from '@/src/components/core/ExpandableSearchButton';
import { Spacing } from '@/src/constants';
import { DateRange } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface FilterToolbarProps {
    // Search
    searchQuery: string;
    onSearchChange: (query: string) => void;
    searchPlaceholder?: string;
    onSearchPress?: () => void; // Optional callback when search button is pressed (for navigation)

    // Date Filter
    dateRange: DateRange | null;
    showDatePicker: () => void;
    navigatePrevious?: () => void;
    navigateNext?: () => void;
    showNavigationArrows?: boolean;
    onSearchExpandChange?: (isExpanded: boolean) => void;

    // Layout
    style?: any;
}

/**
 * FilterToolbar - Unified UI for Search + Date Filtering
 * Used in Dashboard and Journal List
 */
export const FilterToolbar = ({
    searchQuery,
    onSearchChange,
    searchPlaceholder,
    onSearchPress,
    dateRange,
    showDatePicker,
    navigatePrevious,
    navigateNext,
    showNavigationArrows = false,
    onSearchExpandChange,
    style,
}: FilterToolbarProps) => {
    // Derive expanded state from search query (single source of truth)
    // Expanded state is based purely on whether there's a search query
    const isExpanded = searchQuery.length > 0;

    const handleExpandChange = React.useCallback((expanded: boolean) => {
        onSearchExpandChange?.(expanded);
    }, [onSearchExpandChange]);

    return (
        <View style={[styles.container, style]}>
            <View style={[styles.searchWrapper, isExpanded && styles.expandedWrapper]}>
                <ExpandableSearchButton
                    value={searchQuery}
                    onChangeText={onSearchChange}
                    placeholder={searchPlaceholder}
                    onExpandChange={handleExpandChange}
                    onPress={onSearchPress}
                />
            </View>

            {!isExpanded && (
                <DateRangeFilter
                    range={dateRange}
                    onPress={showDatePicker}
                    onPrevious={navigatePrevious}
                    onNext={navigateNext}
                    showNavigationArrows={showNavigationArrows}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    searchWrapper: {
        flexShrink: 0,
    },
    expandedWrapper: {
        flex: 1,
    },
});
