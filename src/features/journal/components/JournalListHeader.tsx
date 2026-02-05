import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { AppText, ExpandableSearchButton } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { DateRange } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface JournalListHeaderProps {
    title: string;
    dateRange: DateRange | null;
    onShowDatePicker: () => void;
    onNavigatePrevious?: () => void;
    onNavigateNext?: () => void;
    searchQuery: string;
    onSearchChange: (value: string) => void;
}

export function JournalListHeader({
    title,
    dateRange,
    onShowDatePicker,
    onNavigatePrevious,
    onNavigateNext,
    searchQuery,
    onSearchChange,
}: JournalListHeaderProps) {
    return (
        <View style={styles.headerContainer}>
            <View style={styles.headerRow}>
                <AppText variant="subheading">
                    {title}
                </AppText>
                <View style={styles.headerActions}>
                    <DateRangeFilter
                        range={dateRange}
                        onPress={onShowDatePicker}
                        onPrevious={onNavigatePrevious}
                        onNext={onNavigateNext}
                        showNavigationArrows={false}
                    />
                    <ExpandableSearchButton
                        value={searchQuery}
                        onChangeText={onSearchChange}
                        placeholder="Search..."
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    headerContainer: {
        marginBottom: Spacing.md,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.sm,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
});
