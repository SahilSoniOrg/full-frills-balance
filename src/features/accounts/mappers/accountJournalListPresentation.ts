import { AppConfig } from '@/src/constants';
import { JournalListItem } from '@/src/types/ui';

const MS_PER_DAY = AppConfig.time.msPerDay;

/**
 * Inserts reconciled markers into grouped journal list items.
 *
 * Expects journals within each expanded day to be time-sorted (see useJournalListGrouping).
 */
export function injectReconciledMarkersIntoJournalList(
  rawGroupedItems: JournalListItem[],
  reconciledAtMs: number | null,
): JournalListItem[] {
  if (reconciledAtMs == null || !rawGroupedItems.length) return rawGroupedItems;

  const reconTime = reconciledAtMs;
  const marker = (): JournalListItem => ({
    id: 'reconciled-separator',
    type: 'reconciledMarker',
    date: reconTime,
  });

  const stamped = rawGroupedItems.map(item => {
    if (item.type !== 'separator' || !item.isCollapsed) return item;
    const endOfDay = item.date + MS_PER_DAY - 1;
    if (reconTime >= item.date && reconTime <= endOfDay) {
      return { ...item, reconciledAt: reconTime };
    }
    return item;
  });

  const collapsedCoversRecon = stamped.some(item => {
    if (item.type !== 'separator' || !item.isCollapsed) return false;
    const endOfDay = item.date + MS_PER_DAY - 1;
    return reconTime >= item.date && reconTime <= endOfDay;
  });
  if (collapsedCoversRecon) return stamped;

  let insertAt = stamped.length;
  let inExpandedReconDay = false;

  for (let i = 0; i < stamped.length; i++) {
    const item = stamped[i];

    if (item.type === 'separator') {
      if (inExpandedReconDay) {
        insertAt = i;
        break;
      }

      const endOfDay = item.date + MS_PER_DAY - 1;
      if (!item.isCollapsed && reconTime >= item.date && reconTime <= endOfDay) {
        inExpandedReconDay = true;
      } else if (!item.isCollapsed && reconTime > endOfDay) {
        insertAt = i;
        break;
      }
      continue;
    }

    if (item.type === 'journal' && item.date != null && item.date <= reconTime) {
      insertAt = i;
      break;
    }
  }

  return [...stamped.slice(0, insertAt), marker(), ...stamped.slice(insertAt)];
}
