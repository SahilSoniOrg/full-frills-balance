export function resolveSelectedItemById<T extends { id: string }>(
  items: readonly T[],
  id: string,
): T | null {
  return items.find(item => item.id === id) ?? null;
}
