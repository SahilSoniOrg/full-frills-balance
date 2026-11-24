import type { JournalListItem } from '@/src/types/ui';

export function selectableJournalIds(items: JournalListItem[]) {
  return [
    ...new Set(
      items.flatMap(item =>
        item.type === 'journal' && item.selectionId ? [item.selectionId] : [],
      ),
    ),
  ];
}
