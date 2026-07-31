import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Size, Spacing } from '@/src/constants';
import { JournalListViewModel } from '@/src/features/journal/hooks/useJournalListViewModel';
import { JournalId, TransactionId } from '@/src/types/domain';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  SelectionActionBar,
  type SelectionAction,
} from '@/src/components/common/SelectionActionBar';

export type JournalListBundle = {
  items: JournalListViewModel['items'];
  isLoading: boolean;
  isLoadingMore: boolean;
  loadingText: string;
  loadingMoreText: string;
  emptyTitle: string;
  emptySubtitle: string;
  onEndReached?: () => void;
  listHeader: React.ReactElement | null;
  listContentStyle?: StyleProp<ViewStyle>;
};

export type JournalChromeBundle = {
  screenTitle?: string;
  showBack?: boolean;
  backIcon?: React.ComponentProps<typeof Screen>['backIcon'];
  headerActions?: React.ReactNode;
  fab?: {
    onPress: () => void;
    label?: string;
    placement?: 'end' | 'center';
    accessibilityLabel?: string;
  };
  isSearchActive?: boolean;
  alignTitle?: React.ComponentProps<typeof Screen>['alignTitle'];
  containerStyle?: StyleProp<ViewStyle>;
};

export type JournalDatePickerBundle = {
  visible: boolean;
  onClose: () => void;
  currentFilter: PeriodFilter;
  onSelect: (range: DateRange | null, filter: PeriodFilter) => void;
};

export type JournalSelectionBundle = {
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected?: () => void;
  actions?: SelectionAction[];
};

export interface JournalListViewProps {
  list: JournalListBundle;
  chrome?: JournalChromeBundle;
  datePicker: JournalDatePickerBundle;
  selection?: JournalSelectionBundle;
}

export const JournalListView = React.forwardRef<any, JournalListViewProps>((props, ref) => {
  const { list, chrome, datePicker, selection } = props;
  return (
    <Screen
      title={chrome?.screenTitle}
      showBack={chrome?.showBack && !selection?.isSelectionModeActive}
      backIcon={chrome?.backIcon}
      headerActions={chrome?.headerActions}
      isSearchActive={chrome?.isSearchActive}
      alignTitle={chrome?.alignTitle}
      headerStyle={{ opacity: selection?.isSelectionModeActive ? Opacity.medium : 1 }}
    >
      <View style={[styles.container, chrome?.containerStyle]}>
        {/* Backdrop (Back) - catches taps that miss the list entirely */}
        {selection?.isSelectionModeActive && (
          <Pressable style={StyleSheet.absoluteFill} onPress={selection.exitSelectionMode} />
        )}

        <TransactionListView
          ref={ref}
          items={list.items}
          isLoading={list.isLoading}
          isLoadingMore={list.isLoadingMore}
          loadingText={list.loadingText}
          loadingMoreText={list.loadingMoreText}
          emptyTitle={list.emptyTitle}
          emptySubtitle={list.emptySubtitle}
          ListHeaderComponent={list.listHeader}
          onEndReached={list.onEndReached}
          contentContainerStyle={[styles.listContent, list.listContentStyle]}
          selectedIds={selection?.selectedIds as Set<string> as Set<TransactionId>}
          onLongPressItem={selection?.onLongPressItem as (id: string) => void}
          isSelectionModeActive={selection?.isSelectionModeActive}
          // Wrap footer in Pressable to catch taps on empty list area
          ListFooterComponent={
            selection?.isSelectionModeActive ? (
              <Pressable style={{ height: 500 }} onPress={selection.exitSelectionMode} />
            ) : undefined
          }
        />

        {chrome?.fab && !selection?.isSelectionModeActive && (
          <FloatingActionButton
            onPress={chrome.fab.onPress}
            label={chrome.fab.label}
            placement={chrome.fab.placement}
            accessibilityLabel={chrome.fab.accessibilityLabel}
          />
        )}

        <SelectionActionBar
          selectedCount={selection?.selectedIds.size || 0}
          totalCount={journalsCount(list.items)}
          onClear={selection?.exitSelectionMode || (() => {})}
          onSelectAll={selection?.selectAll || (() => {})}
          onDeselectAll={selection?.clearItems || (() => {})}
          onShare={selection?.onShareSelected}
          actions={selection?.actions}
          isVisible={!!selection?.isSelectionModeActive}
        />

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

const journalsCount = (items: JournalListViewModel['items']) =>
  items.filter(i => i.type === 'transaction').length;

JournalListView.displayName = 'JournalListView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: Size.buttonLg + Spacing.xl,
  },
});
