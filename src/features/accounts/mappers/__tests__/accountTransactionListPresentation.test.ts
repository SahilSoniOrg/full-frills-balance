import { TransactionListItem } from '@/src/types/ui';
import { injectReconciledMarkersIntoTransactionList } from '../accountTransactionListPresentation';

describe('injectReconciledMarkersIntoTransactionList', () => {
  it('returns input when reconciledAt is null or list is empty', () => {
    const items: TransactionListItem[] = [
      { id: 't1', type: 'transaction', date: 1000 } as TransactionListItem,
    ];
    expect(injectReconciledMarkersIntoTransactionList(items, null)).toBe(items);
    expect(injectReconciledMarkersIntoTransactionList([], new Date(1000))).toEqual([]);
  });

  it('inserts a reconciled marker before the first transaction at or before recon time', () => {
    const recon = new Date(2000);
    const items: TransactionListItem[] = [
      { id: 't-new', type: 'transaction', date: 3000 } as TransactionListItem,
      { id: 't-old', type: 'transaction', date: 1500 } as TransactionListItem,
    ];

    const result = injectReconciledMarkersIntoTransactionList(items, recon);
    expect(result.map(i => i.id)).toEqual(['t-new', 'reconciled-separator', 't-old']);
    expect(result[1]).toMatchObject({
      type: 'reconciledMarker',
      date: 2000,
    });
  });

  it('stamps reconciledAt on a day separator covering the recon time', () => {
    const startOfDay = Date.UTC(2024, 0, 15);
    const recon = new Date(startOfDay + 12 * 60 * 60 * 1000);
    const items: TransactionListItem[] = [
      { id: 'day', type: 'separator', date: startOfDay, isCollapsed: true } as TransactionListItem,
      { id: 't1', type: 'transaction', date: startOfDay + 1000 } as TransactionListItem,
    ];

    const result = injectReconciledMarkersIntoTransactionList(items, recon);
    expect(result[0]).toMatchObject({ id: 'day', reconciledAt: recon.getTime() });
    expect(result.some(i => i.type === 'reconciledMarker')).toBe(false);
  });
});
