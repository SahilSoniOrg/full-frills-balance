import { AppText, EmptyStateView } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { Inline, Skeleton, Stack } from '@/src/design-system';
import { EnrichedJournal } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import React from 'react';
import { ActivityIndicator } from 'react-native';
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
        loadingMoreText,
        emptyTitle = AppConfig.strings.common.noTransactions,
        emptySubtitle = AppConfig.strings.common.tryChangingFilters,
        ListHeaderComponent,
        onEndReached,
        contentContainerStyle,
        estimatedItemSize = AppConfig.layout.listEstimatedItemSize,
    } = props;
    const listEmpty = (isLoading && items.length === 0) ? (
        <Stack gap="md">
            {[1, 2, 3, 4, 5].map(i => (
                <Stack key={i} gap="sm">
                    <Skeleton width={120} height={16} />
                    <Skeleton width="100%" height={80} radius="lg" />
                </Stack>
            ))}
        </Stack>
    ) : (
        <EmptyStateView title={emptyTitle} subtitle={emptySubtitle} />
    );

    const listFooter = isLoadingMore ? (
        <Inline align="center" justify="center" space="sm" paddingVertical="lg">
            <ActivityIndicator size="small" />
            <AppText variant="caption" color="secondary">
                {loadingMoreText || AppConfig.strings.common.loadingMore}
            </AppText>
        </Inline>
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

