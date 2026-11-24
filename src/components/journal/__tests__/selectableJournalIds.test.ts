import { selectableJournalIds } from '../selectableJournalIds';
import { asJournalId } from '@/src/types/ids';
import type { JournalListItem } from '@/src/types/ui';

it('selects each journal once and skips headings and rows without a journal ID', () => {
  const journalId = asJournalId('journal-1');
  const items: JournalListItem[] = [
    { id: 'heading', type: 'separator', date: 0 },
    { id: 'first-leg', type: 'journal', date: 0, selectionId: journalId },
    { id: 'second-leg', type: 'journal', date: 0, selectionId: journalId },
    { id: 'missing-id', type: 'journal', date: 0 },
    { id: 'marker', type: 'reconciledMarker', date: 0 },
  ];

  expect(selectableJournalIds(items)).toEqual([journalId]);
});
