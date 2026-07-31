import { TransactionListView } from '@/src/components/common/TransactionListView';
import { TransactionId } from '@/src/types/domain';
import { TransactionListItem } from '@/src/types/ui';
import React from 'react';

export interface TransactionFeedProps {
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
  contentContainerStyle?: object;
  isPrivacyMode?: boolean;
  selectedIds?: Set<TransactionId>;
  onLongPressItem?: (id: TransactionId) => void;
  isSelectionModeActive?: boolean;
  style?: object;
}

/**
 * Presentational transaction feed for dashboard (and similar embeds).
 * Wraps TransactionListView without Screen, FAB, DateRangePicker, or SelectionActionBar.
 */
export const TransactionFeed = React.forwardRef<any, TransactionFeedProps>((props, ref) => {
  return <TransactionListView ref={ref} {...props} />;
});

TransactionFeed.displayName = 'TransactionFeed';
