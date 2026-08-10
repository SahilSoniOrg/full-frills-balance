import { JournalListItem } from '@/src/types/ui';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inserts reconciled markers into grouped journal list items. */
export function injectReconciledMarkersIntoJournalList(
  rawGroupedItems: JournalListItem[],
  reconciledAt: Date | null,
): JournalListItem[] {
  if (!reconciledAt || !rawGroupedItems.length) return rawGroupedItems;

  const result: JournalListItem[] = [];
  let markerAdded = false;
  let pendingExpandedDayRecon: number | null = null;
  const reconTime = reconciledAt.getTime();

  const pushMarker = () => {
    if (markerAdded) return;
    result.push({
      id: 'reconciled-separator',
      type: 'reconciledMarker',
      date: reconTime,
    });
    markerAdded = true;
    pendingExpandedDayRecon = null;
  };

  for (const item of rawGroupedItems) {
    let itemToPush = item;

    if (!markerAdded) {
      if (item.type === 'journal' && item.date && item.date <= reconTime) {
        pushMarker();
      } else if (item.type === 'separator') {
        if (pendingExpandedDayRecon !== null) {
          // Recon fell on an expanded day where every journal was after the checkpoint.
          pushMarker();
        }

        const startOfDay = item.date;
        const endOfDay = startOfDay + MS_PER_DAY - 1;
        if (reconTime >= startOfDay) {
          if (item.isCollapsed) {
            itemToPush = { ...item, reconciledAt: reconTime };
            if (reconTime <= endOfDay) {
              markerAdded = true;
            }
          } else if (reconTime > endOfDay) {
            pushMarker();
          } else {
            // Expanded day containing the checkpoint — place marker among journals.
            pendingExpandedDayRecon = reconTime;
          }
        }
      }
    }

    result.push(itemToPush);
  }

  if (!markerAdded && pendingExpandedDayRecon !== null) {
    pushMarker();
  }

  return result;
}
