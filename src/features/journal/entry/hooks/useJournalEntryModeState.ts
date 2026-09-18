import {
  JournalEntryRouteEditorMode,
  JournalEntryScreenMode,
  resolveJournalEntryScreenMode,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { getJournalEntryModeSlideDirection } from '@/src/features/journal/entry/journalEntryMode';
import { isSimpleModeDisabledByLines } from '@/src/services/journal/journalEditorHelpers';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useMemo, useState } from 'react';

type JournalEditorModeState = Pick<
  ReturnType<typeof useJournalEditor>,
  'isGuidedMode' | 'setIsGuidedMode' | 'lines'
>;

export function useJournalEntryModeState(
  editor: JournalEditorModeState,
  routeMode?: JournalEntryRouteEditorMode,
) {
  const [activeMode, setActiveMode] = useState<JournalEntryScreenMode>(() =>
    resolveJournalEntryScreenMode(routeMode),
  );
  const [modeTransitionDir, setModeTransitionDir] = useState<1 | -1>(1);
  const { isGuidedMode: editorIsGuidedMode, setIsGuidedMode, lines } = editor;

  // The editor owns guided/expert state. The shell owns only route-level modes
  // (allocation and batch), so a forced expert transition cannot create a
  // second state machine here.
  const effectiveMode = useMemo(
    () => (activeMode === 'basic' && !editorIsGuidedMode ? 'expert' : activeMode),
    [activeMode, editorIsGuidedMode],
  );

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
      setModeTransitionDir(getJournalEntryModeSlideDirection(effectiveMode, mode));
      setActiveMode(mode);
      if (mode === 'basic' || mode === 'expert') {
        setIsGuidedMode(mode === 'basic');
      }
    },
    [effectiveMode, lines, setIsGuidedMode],
  );

  return {
    activeMode: effectiveMode,
    onToggleMode,
    modeTransitionDir,
    isSimpleModeDisabled: isSimpleModeDisabledByLines(lines),
  };
}
