import { JournalId } from '@/src/types/domain';
import { JournalListItem } from '@/src/types/ui';
import { injectReconciledMarkersIntoJournalList } from '../accountJournalListPresentation';

describe('injectReconciledMarkersIntoJournalList', () => {
  it('returns input when reconciledAt is null or list is empty', () => {
    const items: JournalListItem[] = [
      {
        id: 'j1',
        selectionId: 'j1' as JournalId,
        type: 'journal',
        date: 1000,
      },
    ];
    expect(injectReconciledMarkersIntoJournalList(items, null)).toBe(items);
    expect(injectReconciledMarkersIntoJournalList([], new Date(1000))).toEqual([]);
  });

  it('inserts a reconciled marker before the first journal entry at or before recon time', () => {
    const recon = new Date(2000);
    const items: JournalListItem[] = [
      {
        id: 'j-new',
        selectionId: 'j-new' as JournalId,
        type: 'journal',
        date: 3000,
      },
      {
        id: 'j-old',
        selectionId: 'j-old' as JournalId,
        type: 'journal',
        date: 1500,
      },
    ];

    const result = injectReconciledMarkersIntoJournalList(items, recon);
    expect(result.map(i => i.id)).toEqual(['j-new', 'reconciled-separator', 'j-old']);
    expect(result[1]).toMatchObject({
      type: 'reconciledMarker',
      date: 2000,
    });
  });

  it('stamps reconciledAt on a day separator covering the recon time', () => {
    const startOfDay = Date.UTC(2024, 0, 15);
    const recon = new Date(startOfDay + 12 * 60 * 60 * 1000);
    const items: JournalListItem[] = [
      { id: 'day', type: 'separator', date: startOfDay, isCollapsed: true },
      {
        id: 'j1',
        selectionId: 'j1' as JournalId,
        type: 'journal',
        date: startOfDay + 1000,
      },
    ];

    const result = injectReconciledMarkersIntoJournalList(items, recon);
    expect(result[0]).toMatchObject({ id: 'day', reconciledAt: recon.getTime() });
    expect(result.some(i => i.type === 'reconciledMarker')).toBe(false);
  });
});
