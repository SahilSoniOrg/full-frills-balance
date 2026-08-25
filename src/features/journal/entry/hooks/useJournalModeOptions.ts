import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';

export type JournalModeOption = {
  id: JournalEntryScreenMode;
  label: string;
};

const JOURNAL_MODE_OPTIONS: readonly JournalModeOption[] = [
  { id: 'basic', label: 'Simple' },
  { id: 'allocation', label: 'Split' },
  { id: 'expert', label: 'Advanced' },
  { id: 'batch', label: 'Bulk' },
];

/** User-facing mode labels for the transaction composer. */
export function useJournalModeOptions(): readonly JournalModeOption[] {
  return JOURNAL_MODE_OPTIONS;
}
