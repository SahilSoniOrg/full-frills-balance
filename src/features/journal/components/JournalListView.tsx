import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { TransactionCard } from '@/src/components/common/TransactionCard';
import { TypedFlashList } from '@/src/components/common/TypedFlashList';
import { AppText, EmptyStateView, FloatingActionButton, LoadingView } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { JournalListItemViewModel } from '@/src/features/journal/hooks/useJournalListViewModel';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { DaySeparator } from './DaySeparator';

export interface JournalListViewProps {
    screenTitle?: string;
    showBack?: boolean;
    backIcon?: React.ComponentProps<typeof Screen>['backIcon'];
    headerActions?: React.ReactNode;
    listHeader: React.ReactElement | null;
    items: JournalListItemViewModel[];
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
}

export function JournalListView({
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
}: JournalListViewProps) {

    const listEmpty = isLoading ? (
        <LoadingView loading={isLoading} text={loadingText} size="small" />
    ) : (
        <EmptyStateView title={emptyTitle} subtitle={emptySubtitle} />
    );

    const listFooter = isLoadingMore ? (
        <View style={styles.loadingMore}>
            <ActivityIndicator size="small" />
            <AppText variant="caption" color="secondary">
                {loadingMoreText}
            </AppText>
        </View>
    ) : null;

    return (
        <Screen
            title={screenTitle}
            showBack={showBack}
            backIcon={backIcon}
            headerActions={headerActions}
        >
            <View style={[styles.container, containerStyle]}>
                <TypedFlashList
                    data={items}
                    renderItem={({ item }: { item: JournalListItemViewModel }) => (
                        item.type === 'separator' ? (
                            <DaySeparator
                                date={item.date}
                                isCollapsed={item.isCollapsed}
                                onToggle={item.onToggle}
                                count={item.count}
                                netAmount={item.netAmount}
                                currencyCode={item.currencyCode}
                            />
                        ) : (
                            <TransactionCard
                                {...item.cardProps!}
                                onPress={item.onPress!}
                            />
                        )
                    )}
                    keyExtractor={(item: JournalListItemViewModel) => item.id}
                    estimatedItemSize={120}
                    contentContainerStyle={[styles.listContent, listContentStyle]}
                    ListHeaderComponent={listHeader}
                    ListEmptyComponent={listEmpty}
                    ListFooterComponent={listFooter}
                    onEndReached={onEndReached}
                    onEndReachedThreshold={0.5}
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
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingMore: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: Spacing.lg,
        gap: Spacing.sm,
    },
    listContent: {
        padding: Spacing.lg,
    },
});
