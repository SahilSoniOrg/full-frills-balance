import { AppText, EmptyStateView, LoadingView } from '@/src/components/core';
import { Spacing } from '@/src/constants';
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
}

export function TransactionListView({
    items,
    isLoading,
    isLoadingMore,
    loadingText,
    loadingMoreText,
    emptyTitle = 'No transactions',
    emptySubtitle = 'Try changing your filters',
    ListHeaderComponent,
    onEndReached,
    contentContainerStyle,
    estimatedItemSize = 120,
}: TransactionListViewProps) {
    const listEmpty = isLoading ? (
        <LoadingView loading={isLoading} text={loadingText || 'Loading...'} size="small" />
    ) : (
        <EmptyStateView title={emptyTitle} subtitle={emptySubtitle} />
    );

    const listFooter = isLoadingMore ? (
        <View style={styles.loadingMore}>
            <ActivityIndicator size="small" />
            <AppText variant="caption" color="secondary">
                {loadingMoreText || 'Loading more...'}
            </AppText>
        </View>
    ) : null;

    return (
        <TypedFlashList
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
}

const styles = StyleSheet.create({
    loadingMore: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: Spacing.lg,
        gap: Spacing.sm,
    },
});
