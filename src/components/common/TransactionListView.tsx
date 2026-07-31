import { AppText, EmptyStateView } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { Inline, Skeleton, Stack } from '@/src/design-system';
import { ReconciledMarker } from '@/src/features/accounts/components/ReconciledMarker';
import { JournalDayHeader } from '@/src/features/journal/components/JournalDayHeader';
import { TransactionId } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { SelectableTransactionCard } from './SelectableTransactionCard';

interface TransactionListViewProps {
  items: TransactionListItem[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  loadingText?: string;
  loadingMoreText?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  onEndReached?: () => void;
  contentContainerStyle?: any;
  isPrivacyMode?: boolean;
  selectedIds?: Set<TransactionId>;
  onLongPressItem?: (id: TransactionId) => void;
  isSelectionModeActive?: boolean;
  style?: any;
}

function renderListItem({
  item,
  isPrivacyMode,
  selectedIds,
  onLongPressItem,
  isSelectionModeActive,
}: {
  item: TransactionListItem;
  isPrivacyMode?: boolean;
  selectedIds?: Set<TransactionId>;
  onLongPressItem?: (id: TransactionId) => void;
  isSelectionModeActive?: boolean;
}) {
  if (item.type === 'reconciledMarker') {
    return <ReconciledMarker date={item.date} />;
  }

  if (item.type === 'separator') {
    return (
      <JournalDayHeader
        date={item.date}
        isCollapsed={item.isCollapsed}
        onToggle={item.onToggle}
        count={item.count}
        netAmount={item.netAmount}
        currencyCode={item.currencyCode}
        reconciledAt={item.reconciledAt}
        isPrivacyMode={isPrivacyMode}
      />
    );
  }

  return (
    <SelectableTransactionCard
      {...item.cardProps!}
      onPress={item.onPress!}
      onLongPress={onLongPressItem ? () => onLongPressItem(item.id) : undefined}
      isSelected={selectedIds?.has(item.id)}
      isSelectionModeActive={isSelectionModeActive}
      isPrivacyMode={isPrivacyMode}
    />
  );
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
    isPrivacyMode,
    selectedIds,
    onLongPressItem,
    isSelectionModeActive,
  } = props;
  const listEmpty =
    isLoading && items.length === 0 ? (
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

  const listFooter = (
    <Stack>
      {isLoadingMore && (
        <Inline align="center" justify="center" space="sm" paddingVertical="lg">
          <ActivityIndicator size="small" />
          <AppText variant="caption" color="secondary">
            {loadingMoreText || AppConfig.strings.common.loadingMore}
          </AppText>
        </Inline>
      )}
      {props.ListFooterComponent}
    </Stack>
  );

  return (
    <FlashList
      ref={ref}
      data={items}
      renderItem={({ item }: { item: TransactionListItem }) =>
        renderListItem({
          item,
          isPrivacyMode,
          selectedIds,
          onLongPressItem,
          isSelectionModeActive,
        })
      }
      keyExtractor={(item: TransactionListItem) => item.id}
      getItemType={(item: TransactionListItem) => item.type}
      contentContainerStyle={contentContainerStyle}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      keyboardShouldPersistTaps="always"
    />
  );
});

TransactionListView.displayName = 'TransactionListView';
