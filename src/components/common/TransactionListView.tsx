import { AppText, EmptyStateView } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { Spacing } from '@/src/constants';
import { Inline, Skeleton, Stack } from '@/src/design-system';
import { TransactionId } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { JournalDayHeader } from './JournalDayHeader';
import { ReconciledMarker } from './ReconciledMarker';
import { SelectableTransactionCard } from './SelectableTransactionCard';
import { SelectionActionBar, type SelectionAction } from './SelectionActionBar';

export type TransactionListSelectionChrome = {
  exitSelectionMode: () => void;
  selectAll: () => void;
  clearItems: () => void;
  onShareSelected?: () => void;
  actions?: SelectionAction[];
};

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
  contentContainerStyle?: StyleProp<ViewStyle>;
  selectedIds?: Set<TransactionId>;
  onLongPressItem?: (id: TransactionId) => void;
  isSelectionModeActive?: boolean;
  /** Selection-mode secondary chrome (action bar + dismiss). Owned by this list. */
  selectionChrome?: TransactionListSelectionChrome;
  style?: StyleProp<ViewStyle>;
}

function renderListItem({
  item,
  selectedIds,
  onLongPressItem,
  isSelectionModeActive,
}: {
  item: TransactionListItem;
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
    selectedIds,
    onLongPressItem,
    isSelectionModeActive,
    selectionChrome,
    style,
  } = props;

  const selectionActive = !!isSelectionModeActive && !!selectionChrome;
  const transactionCount = items.filter(i => i.type === 'transaction').length;

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

  const dismissFooter = selectionActive ? (
    <View
      onStartShouldSetResponder={() => {
        selectionChrome.exitSelectionMode();
        return false;
      }}
      style={styles.dismissFooter}
    />
  ) : null;

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
      {dismissFooter}
      {props.ListFooterComponent}
    </Stack>
  );

  return (
    <View style={[styles.container, style]}>
      <FlashList
        ref={ref}
        data={items}
        renderItem={({ item }: { item: TransactionListItem }) =>
          renderListItem({
            item,
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

      {selectionChrome ? (
        <SelectionActionBar
          selectedCount={selectedIds?.size ?? 0}
          totalCount={transactionCount}
          onClear={selectionChrome.exitSelectionMode}
          onSelectAll={selectionChrome.selectAll}
          onDeselectAll={selectionChrome.clearItems}
          onShare={selectionChrome.onShareSelected}
          actions={selectionChrome.actions}
          isVisible={selectionActive}
        />
      ) : null}
    </View>
  );
});

TransactionListView.displayName = 'TransactionListView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dismissFooter: {
    height: Spacing.xxxxl * 2,
  },
});
