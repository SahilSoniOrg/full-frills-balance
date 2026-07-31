import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';

export type JournalModeOption = {
  id: JournalEntryScreenMode;
  label: string;
};

const JOURNAL_MODE_OPTIONS: readonly JournalModeOption[] = [
  { id: 'guided', label: 'Simple' },
  { id: 'split', label: 'Split' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'bulk', label: 'Bulk' },
];

/** Shared mode chip labels for journal entry mode switchers. */
export function useJournalModeOptions(): readonly JournalModeOption[] {
  return JOURNAL_MODE_OPTIONS;
}
