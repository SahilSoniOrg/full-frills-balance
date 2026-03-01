import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { JournalListViewModel } from '@/src/features/journal/hooks/useJournalListViewModel';
import { EnrichedJournal } from '@/src/types/domain';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export interface JournalListViewProps {
    screenTitle?: string;
    showBack?: boolean;
    backIcon?: React.ComponentProps<typeof Screen>['backIcon'];
    headerActions?: React.ReactNode;
    listHeader: React.ReactElement | null;
    items: JournalListViewModel['items'];
    isLoading: boolean;
    isLoadingMore: boolean;
    loadingText: string;
    loadingMoreText: string;
    emptyTitle: string;
    emptySubtitle: string;
    onEndReached?: () => void;
    listContentStyle?: StyleProp<ViewStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    datePicker: {
        visible: boolean;
        onClose: () => void;
        currentFilter: PeriodFilter;
        onSelect: (range: DateRange | null, filter: PeriodFilter) => void;
    };
    fab?: {
        onPress: () => void;
    };
    plannedJournals?: EnrichedJournal[];
    onPlannedJournalPress?: (item: EnrichedJournal) => void;
    isSearchActive?: boolean;
    alignTitle?: React.ComponentProps<typeof Screen>['alignTitle'];
}

export const JournalListView = React.forwardRef<any, JournalListViewProps>((props, ref) => {
    const {
        screenTitle,
        showBack,
        backIcon,
        headerActions,
        listHeader,
        items,
        isLoading,
        isLoadingMore,
        loadingText,
        loadingMoreText,
        emptyTitle,
        emptySubtitle,
        onEndReached,
        listContentStyle,
        containerStyle,
        datePicker,
        fab,
        plannedJournals,
        onPlannedJournalPress,
        isSearchActive,
        alignTitle,
    } = props;
    return (
        <Screen
            title={screenTitle}
            showBack={showBack}
            backIcon={backIcon}
            headerActions={headerActions}
            isSearchActive={isSearchActive}
            alignTitle={alignTitle}
        >
            <View style={[styles.container, containerStyle]}>
                <TransactionListView
                    ref={ref}
                    items={items}
                    isLoading={isLoading}
                    isLoadingMore={isLoadingMore}
                    loadingText={loadingText}
                    loadingMoreText={loadingMoreText}
                    emptyTitle={emptyTitle}
                    emptySubtitle={emptySubtitle}
                    ListHeaderComponent={listHeader}
                    onEndReached={onEndReached}
                    contentContainerStyle={[styles.listContent, listContentStyle]}
                    estimatedItemSize={120}
                    plannedJournals={plannedJournals}
                    onPlannedJournalPress={onPlannedJournalPress}
                />

                {fab && (
                    <FloatingActionButton onPress={fab.onPress} />
                )}

                <DateRangePicker
                    visible={datePicker.visible}
                    onClose={datePicker.onClose}
                    currentFilter={datePicker.currentFilter}
                    onSelect={datePicker.onSelect}
                />
            </View>
        </Screen>
    );
});

JournalListView.displayName = 'JournalListView';

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContent: {
        padding: Spacing.lg,
    },
});
