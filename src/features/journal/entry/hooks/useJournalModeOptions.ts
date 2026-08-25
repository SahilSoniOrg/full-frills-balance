import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';

export type JournalModeOption = {
  id: JournalEntryScreenMode;
  label: string;
};

const JOURNAL_MODE_OPTIONS: readonly JournalModeOption[] = [
  { id: 'guided', label: 'Basic' },
  { id: 'split', label: 'Allocate' },
  { id: 'advanced', label: 'Expert' },
];

/** User-facing detail levels for the transaction composer. */
export function useJournalModeOptions(): readonly JournalModeOption[] {
  return JOURNAL_MODE_OPTIONS;
}
