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
  const { isGuidedMode: editorIsGuidedMode, setIsGuidedMode, lines } = editor;
  const isSplitModeDisabled = isSplitModeDisabledByLines(lines);

  // The editor owns guided/expert state. The shell owns only route-level modes
  // (allocation and batch), so a forced expert transition cannot create a
  // second state machine here.
  const effectiveMode = useMemo(
    () =>
      activeMode === 'allocation' && isSplitModeDisabled
        ? 'expert'
        : activeMode === 'basic' && !editorIsGuidedMode
          ? 'expert'
          : activeMode,
    [activeMode, editorIsGuidedMode, isSplitModeDisabled],
  );

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

      setActiveMode(mode);
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
