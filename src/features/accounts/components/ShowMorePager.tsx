import { AppButton } from '@/src/components/core';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { Fragment, useState, type ReactNode } from 'react';

export const SHOW_MORE_FIRST_PAGE = 3;
export const SHOW_MORE_PAGE_STEP = 10;

/** Shared visible-count pager used by matcher evidence, saved-row matches, and SMS pickers. */
export function useShowMorePager(
  total: number,
  options?: { initial?: number; step?: number },
): {
  visibleCount: number;
  hasMore: boolean;
  showMore: () => void;
  reset: (count?: number) => void;
} {
  const initial = options?.initial ?? SHOW_MORE_FIRST_PAGE;
  const step = options?.step ?? SHOW_MORE_PAGE_STEP;
  const [visibleCount, setVisibleCount] = useState(initial);
  return {
    visibleCount,
    hasMore: visibleCount < total,
    showMore: () => setVisibleCount(count => count + step),
    reset: (count = initial) => setVisibleCount(count),
  };
}

export function ShowMoreButton({
  onPress,
  label = copy.showMoreMessages,
  testID,
}: {
  onPress: () => void;
  label?: string;
  testID?: string;
}) {
  return (
    <AppButton variant="ghost" onPress={onPress} testID={testID}>
      {label}
    </AppButton>
  );
}

export function ShowMoreList<T>({
  items,
  keyExtractor,
  renderItem,
  initial = SHOW_MORE_FIRST_PAGE,
  step = SHOW_MORE_PAGE_STEP,
  label,
  testID,
}: {
  items: readonly T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  initial?: number;
  step?: number;
  label?: string;
  testID?: string;
}) {
  const { visibleCount, hasMore, showMore } = useShowMorePager(items.length, { initial, step });
  return (
    <>
      {items.slice(0, visibleCount).map(item => (
        <Fragment key={keyExtractor(item)}>{renderItem(item)}</Fragment>
      ))}
      {hasMore ? <ShowMoreButton onPress={showMore} label={label} testID={testID} /> : null}
    </>
  );
}
