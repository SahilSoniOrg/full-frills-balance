import { AppText, EmptyStateView, ErrorStateView } from '@/src/components/core';
import { AppConfig } from '@/src/constants/app-config';
import { Spacing } from '@/src/constants';
import { Inline, Skeleton, Stack } from '@/src/design-system';
import { JournalId } from '@/src/types/ids';
import { JournalListItem } from '@/src/types/ui';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { JournalDayHeader } from './JournalDayHeader';
import { ReconciledMarker } from './ReconciledMarker';
import { JournalEntryCard } from './JournalEntryCard';

interface JournalEntryListViewProps {
  ref?: React.Ref<JournalEntryListRef>;
  items: JournalListItem[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  error?: Error | null;
  retry?: () => void;
  suppressEmptyContent?: boolean;
  loadingMoreText?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  onEndReached?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  selectedIds?: Set<JournalId>;
  onLongPressItem?: (id: JournalId) => void;
  isSelectionModeActive?: boolean;
  onExitSelectionMode?: () => void;
  style?: StyleProp<ViewStyle>;
}

export interface JournalEntryListRef {
  scrollToOffset: (options: { offset: number; animated?: boolean }) => void;
}

function renderListItem({
  item,
  selectedIds,
  onLongPressItem,
  isSelectionModeActive,
}: {
  item: JournalListItem;
  selectedIds?: Set<JournalId>;
  onLongPressItem?: (id: JournalId) => void;
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
    <JournalEntryCard
      {...item.cardProps!}
      dateDisplay="time"
      onPress={item.onPress!}
      onLongPress={
        onLongPressItem && item.selectionId ? () => onLongPressItem(item.selectionId!) : undefined
      }
      isSelected={item.selectionId ? selectedIds?.has(item.selectionId) : false}
      isSelectionModeActive={isSelectionModeActive}
    />
  );
}

export function JournalEntryListView({ ref, ...props }: JournalEntryListViewProps) {
  const listRef = React.useRef<FlashListRef<JournalListItem>>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      scrollToOffset: options => {
        listRef.current?.scrollToOffset(options);
      },
    }),
    [],
  );

  const {
    items,
    isLoading,
    isLoadingMore,
    error,
    retry,
    suppressEmptyContent,
    loadingMoreText,
    emptyTitle = AppConfig.strings.common.noTransactions,
    emptySubtitle = AppConfig.strings.common.tryChangingFilters,
    ListHeaderComponent,
    onEndReached,
    contentContainerStyle,
    selectedIds,
    onLongPressItem,
    isSelectionModeActive,
    onExitSelectionMode,
    style,
  } = props;

  const loadFailure = (variant: 'screen' | 'inline' = 'screen') =>
    error ? (
      <ErrorStateView
        variant={variant}
        message={AppConfig.strings.common.listLoadError}
        retryLabel={AppConfig.strings.common.retry}
        onRetry={retry}
        style={variant === 'inline' ? styles.loadFailureInline : undefined}
      />
    ) : null;
  const listEmpty = suppressEmptyContent ? null : error ? (
    loadFailure()
  ) : isLoading && items.length === 0 ? (
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

  const dismissFooter = (
    <View
      testID="journal-list-selection-dismiss-area"
      onStartShouldSetResponder={() => {
        if (isSelectionModeActive) onExitSelectionMode?.();
        return false;
      }}
      style={styles.dismissFooter}
    />
  );

  const listFooter = (
    <Stack>
      {items.length > 0 && !suppressEmptyContent ? loadFailure('inline') : null}
      {isLoadingMore && (
        <Inline align="center" justify="center" gap="sm" paddingVertical="lg">
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
        ref={listRef}
        testID="journal-entry-list"
        data={items}
        renderItem={({ item }: { item: JournalListItem }) =>
          renderListItem({
            item,
            selectedIds,
            onLongPressItem,
            isSelectionModeActive,
          })
        }
        keyExtractor={(item: JournalListItem) => item.id}
        getItemType={(item: JournalListItem) => item.type}
        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={ListHeaderComponent}
        ListHeaderComponentStyle={styles.header}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="always"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    // Header tooltips can extend over rows; raise the native header wrapper,
    // since a descendant's zIndex cannot escape its parent's stacking order.
    zIndex: 1,
    overflow: 'visible',
  },
  dismissFooter: {
    height: Spacing.lg,
  },
  loadFailureInline: {
    padding: Spacing.lg,
  },
});
