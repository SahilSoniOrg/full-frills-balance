import type { JournalEntryScreenMode } from './journalEntryPresentation';

export const JOURNAL_ENTRY_MODE_OPTIONS: readonly {
  id: JournalEntryScreenMode;
  label: string;
}[] = [
  { id: 'basic', label: 'Simple' },
  { id: 'allocation', label: 'Split' },
  { id: 'expert', label: 'Advanced' },
  { id: 'batch', label: 'Batch' },
];

const JOURNAL_ENTRY_MODE_RANK: Record<JournalEntryScreenMode, number> = {
  basic: 0,
  allocation: 1,
  expert: 2,
  batch: 3,
};

export function getJournalEntryModeSlideDirection(
  from: JournalEntryScreenMode,
  to: JournalEntryScreenMode,
): 1 | -1 {
  return JOURNAL_ENTRY_MODE_RANK[to] >= JOURNAL_ENTRY_MODE_RANK[from] ? 1 : -1;
}
