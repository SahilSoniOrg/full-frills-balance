export function pinnedSetupCurrencyId(
  alreadyPinned: string | undefined,
  selectedId: string,
  availableIds: readonly string[],
): string | undefined {
  if (alreadyPinned && availableIds.includes(alreadyPinned)) return alreadyPinned;
  if (selectedId && availableIds.includes(selectedId)) return selectedId;
  return alreadyPinned;
}

export function orderSetupCurrencies<T extends { id: string }>(
  items: readonly T[],
  pinnedId: string | undefined,
  searchQuery: string,
): T[] {
  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? items.filter(
        item =>
          item.id.toLowerCase().includes(query) ||
          ('subtitle' in item &&
            typeof item.subtitle === 'string' &&
            item.subtitle.toLowerCase().includes(query)),
      )
    : [...items];
  if (query || !pinnedId) return filtered;
  return filtered.sort((left, right) => {
    if (left.id === pinnedId) return -1;
    if (right.id === pinnedId) return 1;
    return 0;
  });
}
