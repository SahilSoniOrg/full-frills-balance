import {
  JournalEntryRouteEditorMode,
  JournalEntryScreenMode,
  resolveJournalEntryScreenMode,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { isSimpleModeDisabledByLines } from '@/src/services/journal/journalEditorHelpers';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useEffect, useRef, useState } from 'react';

type JournalEditorModeState = Pick<
  ReturnType<typeof useJournalEditor>,
  'isGuidedMode' | 'setIsGuidedMode' | 'lines'
>;

const MODE_ORDER: readonly JournalEntryScreenMode[] = ['basic', 'allocation', 'expert', 'batch'];

function modeSlideDirection(from: JournalEntryScreenMode, to: JournalEntryScreenMode): 1 | -1 {
  const fromIdx = MODE_ORDER.indexOf(from);
  const toIdx = MODE_ORDER.indexOf(to);
  return toIdx >= fromIdx ? 1 : -1;
}

export function useJournalEntryModeState(
  editor: JournalEditorModeState,
  routeMode?: JournalEntryRouteEditorMode,
) {
  const [activeMode, setActiveMode] = useState<JournalEntryScreenMode>(() =>
    resolveJournalEntryScreenMode(routeMode),
  );
  const [modeTransitionDir, setModeTransitionDir] = useState<1 | -1>(1);
  const { isGuidedMode: editorIsGuidedMode, setIsGuidedMode, lines } = editor;

  useEffect(() => {
    setIsGuidedMode(activeMode === 'basic');
  }, [activeMode, setIsGuidedMode]);

  const wasEditorGuidedRef = useRef(editorIsGuidedMode);
  useEffect(() => {
    const wasGuided = wasEditorGuidedRef.current;
    wasEditorGuidedRef.current = editorIsGuidedMode;
    if (wasGuided && !editorIsGuidedMode) {
      setActiveMode(current => {
        if (current !== 'basic') return current;
        return 'expert';
      });
      setModeTransitionDir(1);
    }
  }, [editorIsGuidedMode]);

  const onToggleMode = useCallback(
    (mode: JournalEntryScreenMode) => {
      if (mode === 'basic' && isSimpleModeDisabledByLines(lines)) {
        showErrorAlert(
          'This transaction has more than two lines. Use Expert level to edit it.',
          undefined,
          __DEV__,
        );
        return;
      }

      // Moti owns the panel swap; skip LayoutAnimation so we don't stack ~easeInEaseOut + Moti.
      setModeTransitionDir(modeSlideDirection(activeMode, mode));
      setActiveMode(mode);
    },
    [activeMode, lines],
  );

  return {
    activeMode,
    onToggleMode,
    modeTransitionDir,
    isSimpleModeDisabled: isSimpleModeDisabledByLines(lines),
  };
}
