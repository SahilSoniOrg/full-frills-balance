import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { isSimpleModeDisabledByLines } from '@/src/services/journal/journalEditorHelpers';
import { JournalEntryLine } from '@/src/types/domain';

/**
 * Guided and Advanced read and write `editor.lines`; Split and Bulk keep their own drafts and
 * only build lines at save time.
 */
export function modeOwnsEditorLines(mode: JournalEntryScreenMode): boolean {
  return mode === 'guided' || mode === 'advanced';
}

/**
 * Guided is only blocked by the two-leg limit when the current mode actually owns `editor.lines`.
 * In Split/Bulk those lines are stale leftovers, so counting them would strand the user.
 */
export function isGuidedDisabledForMode(
  mode: JournalEntryScreenMode,
  lines: JournalEntryLine[],
): boolean {
  return modeOwnsEditorLines(mode) && isSimpleModeDisabledByLines(lines);
}
