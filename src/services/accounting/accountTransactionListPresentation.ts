import { TransactionListItem } from '@/src/types/ui';

export type { DisplayCounterAccount as CounterAccountChip } from '@/src/types/domain';
export { buildCounterAccountChips } from '@/src/services/accounting/displayTransactionCounterAccounts';

/** Inserts reconciled markers into grouped transaction list items. */
export function injectReconciledMarkersIntoTransactionList(
  rawGroupedItems: TransactionListItem[],
  reconciledAt: Date | null,
): TransactionListItem[] {
  if (!reconciledAt || !rawGroupedItems.length) return rawGroupedItems;

  const result: TransactionListItem[] = [];
  let markerAdded = false;
  const reconTime = reconciledAt.getTime();

  for (const item of rawGroupedItems) {
    let itemToPush = item;
    if (!markerAdded) {
      if (item.type === 'transaction' && item.date && item.date <= reconTime) {
        result.push({
          id: 'reconciled-separator',
          type: 'separator' as TransactionListItem['type'],
          date: reconTime,
          isReconciledMarker: true,
        } as TransactionListItem);
        markerAdded = true;
      } else if (item.type === 'separator') {
        const startOfDay = item.date;
        const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
        if (reconTime >= startOfDay) {
          itemToPush = { ...item, reconciledAt: reconTime } as TransactionListItem;
          if (reconTime <= endOfDay || item.isCollapsed) markerAdded = true;
          if (!item.isCollapsed && reconTime > endOfDay) {
            result.push({
              id: 'reconciled-separator',
              type: 'separator' as TransactionListItem['type'],
              date: reconTime,
              isReconciledMarker: true,
            } as TransactionListItem);
            markerAdded = true;
          }
        }
      }
    }
    result.push(itemToPush);
  }

  return result;
}
