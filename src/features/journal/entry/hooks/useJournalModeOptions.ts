import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';

export type JournalModeOption = {
  id: JournalEntryScreenMode;
  label: string;
};

const JOURNAL_MODE_OPTIONS: readonly JournalModeOption[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'allocation', label: 'Allocate' },
  { id: 'expert', label: 'Expert' },
];

/** User-facing detail levels for the transaction composer. */
export function useJournalModeOptions(): readonly JournalModeOption[] {
  return JOURNAL_MODE_OPTIONS;
}
