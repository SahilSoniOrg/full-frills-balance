import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import {
  createTwoLegJournalScaffold,
  isSimpleModeDisabledByLines,
  normalizeJournalLinesForGuidedMode,
} from '@/src/services/journal/journalEditorHelpers';
import { JournalEntryLine } from '@/src/types/domainJournal';

/** The modes whose edits live in `editor.lines`. */
export type JournalLinesOwningMode = Extract<JournalEntryScreenMode, 'guided' | 'advanced'>;

/**
 * Guided and Advanced read and write `editor.lines`; Split and Bulk keep their own drafts and
 * only build lines at save time.
 */
export function modeOwnsEditorLines(mode: JournalEntryScreenMode): mode is JournalLinesOwningMode {
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

/** Lines parked by each mode that owns them, so a detour through Split/Bulk is not destructive. */
export type JournalModeLineSnapshots = Partial<Record<JournalEntryScreenMode, JournalEntryLine[]>>;

/**
 * `blocked` means the target mode was rejected and nothing should change; the caller surfaces
 * the too-many-lines error. `applied` carries the mode actually entered, which is not always the
 * requested one — Guided falls back to Advanced when the lines cannot render as two legs.
 */
export type JournalModeTransition =
  | { status: 'blocked' }
  | {
      status: 'applied';
      nextMode: JournalEntryScreenMode;
      nextLines: JournalEntryLine[];
      snapshots: JournalModeLineSnapshots;
    };

export interface JournalModeTransitionInput {
  from: JournalEntryScreenMode;
  to: JournalEntryScreenMode;
  lines: JournalEntryLine[];
  snapshots: JournalModeLineSnapshots;
}

/** Prefers the target mode's own parked lines, then the other lines-owning mode's, then a scaffold. */
function restoreLinesForMode(
  mode: JournalLinesOwningMode,
  snapshots: JournalModeLineSnapshots,
): JournalEntryLine[] {
  const other = mode === 'guided' ? 'advanced' : 'guided';
  return snapshots[mode] ?? snapshots[other] ?? createTwoLegJournalScaffold();
}

/** Resolves the mode, editor lines and snapshots to commit when the user picks a mode chip. */
export function resolveJournalModeTransition(
  input: JournalModeTransitionInput,
): JournalModeTransition {
  const { from, to, lines, snapshots } = input;

  if (to === from) {
    return { status: 'applied', nextMode: from, nextLines: lines, snapshots };
  }

  const nextSnapshots = modeOwnsEditorLines(from) ? { ...snapshots, [from]: lines } : snapshots;

  // Split and Bulk assemble their lines only at save time, so park a clean scaffold rather than
  // letting whatever Guided/Advanced left behind sit in shared editor state.
  if (!modeOwnsEditorLines(to)) {
    return {
      status: 'applied',
      nextMode: to,
      nextLines: createTwoLegJournalScaffold(),
      snapshots: nextSnapshots,
    };
  }

  const nextLines = modeOwnsEditorLines(from) ? lines : restoreLinesForMode(to, nextSnapshots);

  if (to !== 'guided') {
    return { status: 'applied', nextMode: to, nextLines, snapshots: nextSnapshots };
  }

  if (isSimpleModeDisabledByLines(nextLines)) {
    return { status: 'blocked' };
  }

  // Guided renders exactly one credit and one debit leg. When the lines cannot collapse into
  // that shape, land on Advanced instead of claiming a mode the editor will refuse to enter.
  const normalized = normalizeJournalLinesForGuidedMode(nextLines);
  if (normalized.forceAdvancedMode) {
    return { status: 'applied', nextMode: 'advanced', nextLines, snapshots: nextSnapshots };
  }

  return {
    status: 'applied',
    nextMode: 'guided',
    nextLines: normalized.lines,
    snapshots: nextSnapshots,
  };
}
