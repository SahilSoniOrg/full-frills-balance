import {
  JournalEntryRouteEditorMode,
  JournalEntryScreenMode,
  resolveJournalEntryScreenMode,
} from '@/src/features/journal/entry/journalEntryPresentation';
import {
  isSimpleModeDisabledByLines,
  isSplitModeDisabledByLines,
} from '@/src/services/journal/journalEditorHelpers';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useState } from 'react';

type JournalEditorModeState = Pick<
  ReturnType<typeof useJournalEditor>,
  'isGuidedMode' | 'setIsGuidedMode' | 'lines'
>;

export function useJournalEntryModeState(
  editor: JournalEditorModeState,
  routeMode?: JournalEntryRouteEditorMode,
) {
  const { isGuidedMode: editorIsGuidedMode, setIsGuidedMode, lines } = editor;
  const [shellMode, setShellMode] = useState<'allocation' | 'batch' | null>(() => {
    const initialMode = resolveJournalEntryScreenMode(routeMode);
    return initialMode === 'allocation' || initialMode === 'batch' ? initialMode : null;
  });
  const isSplitModeDisabled = isSplitModeDisabledByLines(lines);

  // Basic/Advanced follow the editor flag; only Split/Batch need shell state.
  const activeMode: JournalEntryScreenMode = shellMode ?? (editorIsGuidedMode ? 'basic' : 'expert');
  const effectiveMode = activeMode === 'allocation' && isSplitModeDisabled ? 'expert' : activeMode;

  const onToggleMode = useCallback(
    (mode: JournalEntryScreenMode) => {
      if (mode === 'basic' && isSimpleModeDisabledByLines(lines)) {
        showErrorAlert(
          'This entry has more than two lines. Use Advanced mode to edit it.',
          undefined,
          __DEV__,
        );
        return;
      }
      if (mode === 'allocation' && isSplitModeDisabled) {
        showErrorAlert(
          'This entry has multiple source lines. Use Advanced mode to edit it.',
          undefined,
          __DEV__,
        );
        return;
      }

      setShellMode(mode === 'allocation' || mode === 'batch' ? mode : null);
      if (mode === 'basic' || mode === 'expert') {
        setIsGuidedMode(mode === 'basic');
      }
    },
    [isSplitModeDisabled, lines, setIsGuidedMode],
  );

  return {
    activeMode: effectiveMode,
    onToggleMode,
    isSimpleModeDisabled: isSimpleModeDisabledByLines(lines),
    isSplitModeDisabled,
  };
}
