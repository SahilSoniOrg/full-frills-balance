import type { UseSelectionResult } from '@/src/hooks/useSelection';
import { useMemo } from 'react';

/**
 * Pure selection-derived data: an id→item index plus the currently-selected
 * subset, all derived from `items` and a `useSelection` result.
 *
 * `TItem` must expose a stable `id` of type `TId` — this is why the hook takes
 * no `getId` accessor. Deriving the key from `item.id` directly (rather than a
 * caller-supplied function) is what keeps `itemsById` referentially stable: a
 * per-render `getId` arrow would otherwise defeat the memo.
 */
export function useSelectedItemMap<TItem extends { id: TId }, TId extends string | number>(
  items: TItem[],
  selection: UseSelectionResult<TId>,
) {
  const itemsById = useMemo(
    () => new Map(items.map(item => [item.id, item] as [TId, TItem])),
    [items],
  );

  const selectedItems = useMemo(
    () =>
      Array.from(selection.selectedIds)
        .map(id => itemsById.get(id))
        .filter((item): item is TItem => item !== undefined),
    [selection.selectedIds, itemsById],
  );

  return { itemsById, selectedItems };
}
