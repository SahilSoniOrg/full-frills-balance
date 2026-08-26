import {
  JournalEntryRouteEditorMode,
  JournalEntryScreenMode,
  resolveJournalEntryScreenMode,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { isSimpleModeDisabledByLines } from '@/src/services/journal/journalEditorHelpers';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutAnimation } from 'react-native';

type JournalEditorModeState = Pick<
  ReturnType<typeof useJournalEditor>,
  'isGuidedMode' | 'setIsGuidedMode' | 'setTransactionType' | 'lines'
>;

export function useJournalEntryModeState(
  editor: JournalEditorModeState,
  routeMode?: JournalEntryRouteEditorMode,
) {
  const [activeMode, setActiveMode] = useState<JournalEntryScreenMode>(() =>
    resolveJournalEntryScreenMode(routeMode),
  );
  const { isGuidedMode: editorIsGuidedMode, setIsGuidedMode, setTransactionType, lines } = editor;

  useEffect(() => {
    setIsGuidedMode(activeMode === 'basic');
    if (activeMode === 'allocation') setTransactionType('expense');
  }, [activeMode, setIsGuidedMode, setTransactionType]);

  const wasEditorGuidedRef = useRef(editorIsGuidedMode);
  useEffect(() => {
    const wasGuided = wasEditorGuidedRef.current;
    wasEditorGuidedRef.current = editorIsGuidedMode;
    if (wasGuided && !editorIsGuidedMode) {
      setActiveMode(current => (current === 'basic' ? 'expert' : current));
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

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActiveMode(mode);
    },
    [lines],
  );

  return {
    activeMode,
    onToggleMode,
    isSimpleModeDisabled: isSimpleModeDisabledByLines(lines),
  };
}
