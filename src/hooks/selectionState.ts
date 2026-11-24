export function getSelectionState<T>(selectedIds: ReadonlySet<T>, selectableIds: readonly T[]) {
  const hasSelection = selectableIds.some(id => selectedIds.has(id));
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));

  return {
    selectedCount: selectedIds.size,
    selectableCount: selectableIds.length,
    checked: allSelected ? true : hasSelection ? ('mixed' as const) : false,
  };
}
