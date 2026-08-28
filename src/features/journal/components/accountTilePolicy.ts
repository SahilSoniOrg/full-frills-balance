export const DEFAULT_MAX_QUICK_TILES = 15;

export function limitQuickTileAccounts<T extends { id: string }>(
  accounts: T[],
  selectedId: string,
  limit: number = DEFAULT_MAX_QUICK_TILES,
): T[] {
  if (accounts.length <= limit) return accounts;
  const top = accounts.slice(0, limit);
  if (selectedId && !top.some(a => a.id === selectedId)) {
    const selected = accounts.find(a => a.id === selectedId);
    if (selected) return [...top.slice(0, limit - 1), selected];
  }
  return top;
}
