import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { JournalEntryListView } from '@/src/components/common/JournalEntryListView';
import { type ListSelectionChrome } from '@/src/components/common/SelectionActionBar';
import { ScreenWithChrome, type ScreenChrome } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import {
  JournalListModals,
  type JournalListModalsProps,
} from '@/src/features/journal/components/JournalListModals';
import { JournalId } from '@/src/types/domain';
import { JournalListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type JournalListBundle = {
  items: JournalListItem[];
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

export type JournalSelectionBundle = ListSelectionChrome & {
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
};

export interface JournalListViewProps {
  list: JournalListBundle;
  chrome: ScreenChrome;
  /** Omit when the screen owns its own DateRangePicker (e.g. search filters). */
  datePicker?: JournalDatePickerBundle;
  periodBar?: JournalPeriodBarBundle;
  selection?: JournalSelectionBundle;
  modals?: JournalListModalsProps;
}

export const JournalListView = React.forwardRef<any, JournalListViewProps>((props, ref) => {
  const { list, chrome, datePicker, periodBar, selection, modals } = props;

  return (
    <ScreenWithChrome chrome={chrome}>
      <View style={styles.container}>
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

        <JournalEntryListView
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
          selectedIds={selection?.selectedIds}
          onLongPressItem={selection?.onLongPressItem}
          isSelectionModeActive={selection?.isSelectionModeActive}
          selectionChrome={selection}
        />

        {datePicker ? (
          <DateRangePicker
            visible={datePicker.visible}
            onClose={datePicker.onClose}
            currentFilter={datePicker.currentFilter}
            onSelect={datePicker.onSelect}
          />
        ) : null}

        {modals ? <JournalListModals {...modals} /> : null}
      </View>
    </ScreenWithChrome>
  );
});

JournalListView.displayName = 'JournalListView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  periodBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
});
