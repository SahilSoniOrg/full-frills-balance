import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { FloatingActionButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Size, Spacing } from '@/src/constants';
import { JournalListViewModel } from '@/src/features/journal/hooks/useJournalListViewModel';
import { EnrichedJournal, JournalId, TransactionId } from '@/src/types/domain';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SelectionActionBar } from '@/src/components/common/SelectionActionBar';

export interface JournalListViewProps {
  screenTitle?: string;
  showBack?: boolean;
  backIcon?: React.ComponentProps<typeof Screen>['backIcon'];
  headerActions?: React.ReactNode;
  listHeader: React.ReactElement | null;
  items: JournalListViewModel['items'];
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
    label?: string;
    placement?: 'end' | 'center';
    accessibilityLabel?: string;
  };
  plannedJournals?: EnrichedJournal[];
  onPlannedJournalPress?: (item: EnrichedJournal) => void;
  isPrivacyMode?: boolean;
  isSearchActive?: boolean;
  alignTitle?: React.ComponentProps<typeof Screen>['alignTitle'];
  selection?: {
    selectedIds: Set<JournalId>;
    isSelectionModeActive: boolean;
    onLongPressItem: (id: JournalId) => void;
    toggleSelection: (id: JournalId) => void;
    selectAll: () => void;
    clearItems: () => void;
    exitSelectionMode: () => void;
    onShareSelected: () => void;
  };
}

export const JournalListView = React.forwardRef<any, JournalListViewProps>((props, ref) => {
  const {
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
    plannedJournals,
    onPlannedJournalPress,
    isSearchActive,
    isPrivacyMode,
    alignTitle,
    selection,
  } = props;
  return (
    <Screen
      title={screenTitle}
      showBack={showBack && !selection?.isSelectionModeActive}
      backIcon={backIcon}
      headerActions={headerActions}
      isSearchActive={isSearchActive}
      alignTitle={alignTitle}
      headerStyle={{ opacity: selection?.isSelectionModeActive ? Opacity.medium : 1 }}
    >
      <View style={[styles.container, containerStyle]}>
        {/* Backdrop (Back) - catches taps that miss the list entirely */}
        {selection?.isSelectionModeActive && (
          <Pressable style={StyleSheet.absoluteFill} onPress={selection.exitSelectionMode} />
        )}

        <TransactionListView
          ref={ref}
          items={items}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          loadingText={loadingText}
          loadingMoreText={loadingMoreText}
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
          ListHeaderComponent={listHeader}
          onEndReached={onEndReached}
          contentContainerStyle={[styles.listContent, listContentStyle]}
          plannedJournals={plannedJournals}
          onPlannedJournalPress={onPlannedJournalPress}
          isPrivacyMode={isPrivacyMode}
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

        {fab && !selection?.isSelectionModeActive && (
          <FloatingActionButton
            onPress={fab.onPress}
            label={fab.label}
            placement={fab.placement}
            accessibilityLabel={fab.accessibilityLabel}
          />
        )}

        <SelectionActionBar
          selectedCount={selection?.selectedIds.size || 0}
          totalCount={journalsCount(items)}
          onClear={selection?.exitSelectionMode || (() => {})}
          onSelectAll={selection?.selectAll || (() => {})}
          onDeselectAll={selection?.clearItems || (() => {})}
          onShare={selection?.onShareSelected || (() => {})}
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
