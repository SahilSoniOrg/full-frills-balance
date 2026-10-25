type SetupCurrencyItem = {
  id: string;
  subtitle?: string;
  symbol?: string;
};

export function orderSetupCurrencies<T extends SetupCurrencyItem>(
  items: readonly T[],
  pinnedId: string | undefined,
  searchQuery: string,
): T[] {
  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? items.filter(
        item =>
          item.id.toLowerCase().includes(query) ||
          item.subtitle?.toLowerCase().includes(query) ||
          item.symbol?.toLowerCase().includes(query),
      )
    : [...items];
  if (query || !pinnedId) return filtered;
  return filtered.sort((left, right) => {
    if (left.id === pinnedId) return -1;
    if (right.id === pinnedId) return 1;
    return 0;
  });
}
