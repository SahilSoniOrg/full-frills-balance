import { AppConfig } from '@/src/constants';
import {
  JournalEntryRouteEditorMode,
  JournalEntryScreenMode,
  resolveJournalEntryScreenMode,
} from '@/src/features/journal/entry/journalEntryPresentation';
import {
  isGuidedDisabledForMode,
  JournalModeLineSnapshots,
  resolveJournalModeTransition,
} from '@/src/features/journal/entry/journalModeTransition';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useEffect, useRef, useState } from 'react';

type JournalEditorModeState = Pick<
  ReturnType<typeof useJournalEditor>,
  'isGuidedMode' | 'setIsGuidedMode' | 'setTransactionType' | 'lines' | 'setLines'
>;

export function useJournalEntryModeState(
  editor: JournalEditorModeState,
  routeMode?: JournalEntryRouteEditorMode,
) {
  const [activeMode, setActiveMode] = useState<JournalEntryScreenMode>(() =>
    resolveJournalEntryScreenMode(routeMode),
  );
  const { isGuidedMode: editorIsGuidedMode, setIsGuidedMode, setTransactionType } = editor;
  const { lines, setLines } = editor;

  useEffect(() => {
    setIsGuidedMode(activeMode === 'guided');
    if (activeMode === 'split') setTransactionType('expense');
  }, [activeMode, setIsGuidedMode, setTransactionType]);

  const wasEditorGuidedRef = useRef(editorIsGuidedMode);
  useEffect(() => {
    const wasGuided = wasEditorGuidedRef.current;
    wasEditorGuidedRef.current = editorIsGuidedMode;
    if (wasGuided && !editorIsGuidedMode) {
      setActiveMode(current => (current === 'guided' ? 'advanced' : current));
    }
  }, [editorIsGuidedMode]);

  const modeSnapshotsRef = useRef<JournalModeLineSnapshots>({});
  const onToggleMode = useCallback(
    (mode: JournalEntryScreenMode) => {
      const transition = resolveJournalModeTransition({
        from: activeMode,
        to: mode,
        lines,
        snapshots: modeSnapshotsRef.current,
      });

      if (transition.status === 'blocked') {
        showErrorAlert(AppConfig.strings.validation.simpleModeTooManyLines, undefined, __DEV__);
        return;
      }

      modeSnapshotsRef.current = transition.snapshots;
      setLines(transition.nextLines);
      setActiveMode(transition.nextMode);
    },
    [activeMode, lines, setLines],
  );

  return {
    activeMode,
    onToggleMode,
    isSimpleModeDisabled: isGuidedDisabledForMode(activeMode, lines),
  };
}
