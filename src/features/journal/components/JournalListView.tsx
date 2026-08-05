import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { ScreenWithChrome, type ScreenChrome } from '@/src/components/layout';
import { Size, Spacing } from '@/src/constants';
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

export type JournalDatePickerBundle = {
  visible: boolean;
  onClose: () => void;
  currentFilter: PeriodFilter;
  onSelect: (range: DateRange | null, filter: PeriodFilter) => void;
};

/** Sticky period control under nav (secondary chrome layer). */
export type JournalPeriodBarBundle = {
  range: DateRange | null;
  onPress: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
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
  chrome: ScreenChrome;
  /** Omit when the screen owns its own DateRangePicker (e.g. search filters). */
  datePicker?: JournalDatePickerBundle;
  periodBar?: JournalPeriodBarBundle;
  selection?: JournalSelectionBundle;
}

export const JournalListView = React.forwardRef<any, JournalListViewProps>((props, ref) => {
  const { list, chrome, datePicker, periodBar, selection } = props;
  return (
    <ScreenWithChrome chrome={chrome}>
      <View style={styles.container}>
        {selection?.isSelectionModeActive && (
          <Pressable style={StyleSheet.absoluteFill} onPress={selection.exitSelectionMode} />
        )}

        {periodBar ? (
          <View style={styles.periodBar}>
            <DateRangeFilter
              range={periodBar.range}
              onPress={periodBar.onPress}
              onPrevious={periodBar.onPrevious}
              onNext={periodBar.onNext}
              fullWidth
              showNavigationArrows
            />
          </View>
        ) : null}

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
          ListFooterComponent={
            selection?.isSelectionModeActive ? (
              <Pressable style={{ height: 500 }} onPress={selection.exitSelectionMode} />
            ) : undefined
          }
        />

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

        {datePicker ? (
          <DateRangePicker
            visible={datePicker.visible}
            onClose={datePicker.onClose}
            currentFilter={datePicker.currentFilter}
            onSelect={datePicker.onSelect}
          />
        ) : null}
      </View>
    </ScreenWithChrome>
  );
});

const journalsCount = (items: JournalListViewModel['items']) =>
  items.filter(i => i.type === 'transaction').length;

JournalListView.displayName = 'JournalListView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  periodBar: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: Size.buttonLg + Spacing.xl,
  },
});
