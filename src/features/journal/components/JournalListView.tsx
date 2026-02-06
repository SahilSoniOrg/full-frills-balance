import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { TransactionCard } from '@/src/components/common/TransactionCard';
import { TypedFlashList } from '@/src/components/common/TypedFlashList';
import { AppText, FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { JournalListItemViewModel } from '@/src/features/journal/hooks/useJournalListViewModel';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface JournalListViewProps {
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
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
            <AppText variant="body" color="secondary" style={{ marginTop: Spacing.sm }}>
                {loadingText}
            </AppText>
        </View>
    ) : (
        <View style={styles.emptyContainer}>
            <AppText variant="heading" style={styles.emptyText}>
                {emptyTitle}
            </AppText>
            <AppText variant="body" color="secondary" style={styles.emptySubtext}>
                {emptySubtitle}
            </AppText>
        </View>
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
                        <TransactionCard
                            {...item.cardProps}
                            onPress={item.onPress}
                        />
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
        marginBottom: Spacing.sm,
    },
    emptySubtext: {
        textAlign: 'center',
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
