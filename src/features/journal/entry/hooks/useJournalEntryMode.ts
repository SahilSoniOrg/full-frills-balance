import { AppConfig } from '@/src/constants';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import {
  JournalEntryRouteEditorMode,
  JournalEntryScreenMode,
  resolveJournalEntryScreenMode,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useEffect, useState } from 'react';

/**
 * Screen mode owner for journal entry.
 * One-way sync: activeMode → editor.isGuidedMode (no reverse dual sync).
 */
export function useJournalEntryMode(
  editor: ReturnType<typeof useJournalEditor>,
  options: {
    routeMode?: JournalEntryRouteEditorMode;
    isSimpleModeDisabled: boolean;
  },
) {
  const [activeMode, setActiveMode] = useState<JournalEntryScreenMode>(() =>
    resolveJournalEntryScreenMode(options.routeMode),
  );

  const isGuidedScreen = activeMode === 'guided';
  const { setIsGuidedMode, setTransactionType } = editor;

  // Screen mode is SSOT; drive editor guided flag one-way (no isGuidedMode → activeMode).
  useEffect(() => {
    setIsGuidedMode(activeMode === 'guided');
    if (activeMode === 'split') {
      setTransactionType('expense');
    }
  }, [activeMode, setIsGuidedMode, setTransactionType]);

  const onToggleMode = useCallback(
    (mode: JournalEntryScreenMode) => {
      if (mode === 'guided' && options.isSimpleModeDisabled) {
        showErrorAlert(AppConfig.strings.validation.simpleModeTooManyLines, undefined, __DEV__);
        return;
      }
      setActiveMode(mode);
    },
    [options.isSimpleModeDisabled],
  );

  return { activeMode, onToggleMode, isGuidedScreen };
}
