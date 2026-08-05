import { JournalListItem } from '@/src/types/ui';

/** Inserts reconciled markers into grouped journal list items. */
export function injectReconciledMarkersIntoJournalList(
  rawGroupedItems: JournalListItem[],
  reconciledAt: Date | null,
): JournalListItem[] {
  if (!reconciledAt || !rawGroupedItems.length) return rawGroupedItems;

  const result: JournalListItem[] = [];
  let markerAdded = false;
  const reconTime = reconciledAt.getTime();

  for (const item of rawGroupedItems) {
    let itemToPush = item;
    if (!markerAdded) {
      if (item.type === 'journal' && item.date && item.date <= reconTime) {
        result.push({
          id: 'reconciled-separator',
          type: 'reconciledMarker',
          date: reconTime,
        });
        markerAdded = true;
      } else if (item.type === 'separator') {
        const startOfDay = item.date;
        const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
        if (reconTime >= startOfDay) {
          itemToPush = { ...item, reconciledAt: reconTime };
          if (reconTime <= endOfDay || item.isCollapsed) markerAdded = true;
          if (!item.isCollapsed && reconTime > endOfDay) {
            result.push({
              id: 'reconciled-separator',
              type: 'reconciledMarker',
              date: reconTime,
            });
            markerAdded = true;
          }
        }
      }
    }
    result.push(itemToPush);
  }

  return result;
}
