import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import {
  createTwoLegJournalScaffold,
  isSimpleModeDisabledByLines,
  normalizeJournalLinesForGuidedMode,
} from '@/src/services/journal/journalEditorHelpers';
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

/**
 * `blocked` means the target mode was rejected and nothing should change; the caller surfaces
 * the too-many-lines error. `applied` carries the mode actually entered, which is not always the
 * requested one — Guided falls back to Advanced when the lines cannot render as two legs.
 */
export type JournalModeTransition =
  | { status: 'blocked' }
  | { status: 'applied'; nextMode: JournalEntryScreenMode; nextLines: JournalEntryLine[] };

export interface JournalModeTransitionInput {
  from: JournalEntryScreenMode;
  to: JournalEntryScreenMode;
  lines: JournalEntryLine[];
}

/** Resolves the mode and editor lines to commit when the user picks a different mode chip. */
export function resolveJournalModeTransition(
  input: JournalModeTransitionInput,
): JournalModeTransition {
  const { from, to, lines } = input;

  const isLeavingDraftMode = !modeOwnsEditorLines(from) && to !== from;
  const nextLines = isLeavingDraftMode ? createTwoLegJournalScaffold() : lines;

  if (to !== 'guided') {
    return { status: 'applied', nextMode: to, nextLines };
  }

  if (isSimpleModeDisabledByLines(nextLines)) {
    return { status: 'blocked' };
  }

  // Guided renders exactly one credit and one debit leg. When the lines cannot collapse into
  // that shape, land on Advanced instead of claiming a mode the editor will refuse to enter.
  const normalized = normalizeJournalLinesForGuidedMode(nextLines);
  if (normalized.forceAdvancedMode) {
    return { status: 'applied', nextMode: 'advanced', nextLines };
  }

  return { status: 'applied', nextMode: 'guided', nextLines: normalized.lines };
}
