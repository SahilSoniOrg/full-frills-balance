import { AppText, EmptyStateView, LoadingView } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { EnrichedJournal } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DaySeparator } from './DaySeparator';
import { TransactionCard } from './TransactionCard';
import { TypedFlashList } from './TypedFlashList';

interface TransactionListViewProps {
    items: TransactionListItem[];
    isLoading?: boolean;
    isLoadingMore?: boolean;
    loadingText?: string;
    loadingMoreText?: string;
    emptyTitle?: string;
    emptySubtitle?: string;
    ListHeaderComponent?: React.ReactElement | null;
    onEndReached?: () => void;
    contentContainerStyle?: any;
    estimatedItemSize?: number;
    plannedJournals?: EnrichedJournal[];
    onPlannedJournalPress?: (item: EnrichedJournal) => void;
}

export const TransactionListView = React.forwardRef<any, TransactionListViewProps>((props, ref) => {
    const {
        items,
        isLoading,
        isLoadingMore,
        loadingText,
        loadingMoreText,
        emptyTitle = AppConfig.strings.common.noTransactions,
        emptySubtitle = AppConfig.strings.common.tryChangingFilters,
        ListHeaderComponent,
        onEndReached,
        contentContainerStyle,
        estimatedItemSize = AppConfig.layout.listEstimatedItemSize,
    } = props;
    const listEmpty = (isLoading && items.length === 0) ? (
        <LoadingView loading={isLoading} text={loadingText || AppConfig.strings.common.loading} size="small" />
    ) : (
        <EmptyStateView title={emptyTitle} subtitle={emptySubtitle} />
    );

    const listFooter = isLoadingMore ? (
        <View style={styles.loadingMore}>
            <ActivityIndicator size="small" />
            <AppText variant="caption" color="secondary">
                {loadingMoreText || AppConfig.strings.common.loadingMore}
            </AppText>
        </View>
    ) : null;

    return (
        <TypedFlashList
            ref={ref}
            data={items}
            renderItem={({ item }: { item: TransactionListItem }) => (
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
            keyExtractor={(item: TransactionListItem) => item.id}
            getItemType={(item: TransactionListItem) => item.type}
            estimatedItemSize={estimatedItemSize}
            contentContainerStyle={contentContainerStyle}
            ListHeaderComponent={ListHeaderComponent}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={listFooter}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
        />
    );
});

TransactionListView.displayName = 'TransactionListView';

const styles = StyleSheet.create({
    loadingMore: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: Spacing.lg,
        gap: Spacing.sm,
    },
});
