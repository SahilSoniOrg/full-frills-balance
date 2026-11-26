export function getSelectionState<T>(selectedIds: ReadonlySet<T>, selectableIds: readonly T[]) {
  let selectedSelectableCount = 0;
  for (const id of selectableIds) {
    if (selectedIds.has(id)) selectedSelectableCount++;
  }
  const allSelected = selectableIds.length > 0 && selectedSelectableCount === selectableIds.length;

  return {
    selectedCount: selectedIds.size,
    selectedSelectableCount,
    selectableCount: selectableIds.length,
    checked: allSelected ? true : selectedSelectableCount > 0 ? ('mixed' as const) : false,
  };
}

/** Drop selected ids that are no longer present. Returns `selectedIds` when nothing changed. */
export function pruneSelectedIds<T>(selectedIds: Set<T>, validIds: Iterable<T>): Set<T>;
export function pruneSelectedIds<T>(
  selectedIds: ReadonlySet<T>,
  validIds: Iterable<T>,
): ReadonlySet<T>;
export function pruneSelectedIds<T>(
  selectedIds: ReadonlySet<T>,
  validIds: Iterable<T>,
): ReadonlySet<T> {
  const valid = validIds instanceof Set ? validIds : new Set(validIds);
  let removed = false;
  const next = new Set<T>();
  for (const id of selectedIds) {
    if (valid.has(id)) {
      next.add(id);
    } else {
      removed = true;
    }
  }
  return removed ? next : selectedIds;
}
