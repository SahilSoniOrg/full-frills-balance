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
