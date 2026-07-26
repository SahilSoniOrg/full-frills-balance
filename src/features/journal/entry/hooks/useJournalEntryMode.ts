import { AppConfig } from '@/src/constants';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import {
  JournalEntryRouteEditorMode,
  JournalEntryScreenMode,
  resolveJournalEntryScreenMode,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { showErrorAlert } from '@/src/utils/alerts';
import { useCallback, useEffect, useState } from 'react';

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

  const { setIsGuidedMode, setTransactionType, isGuidedMode, transactionType } = editor;

  useEffect(() => {
    const shouldBeGuided = activeMode === 'guided';
    if (isGuidedMode !== shouldBeGuided) {
      setIsGuidedMode(shouldBeGuided);
    }
    if (activeMode === 'split' && transactionType !== 'expense') {
      setTransactionType('expense');
    }
  }, [activeMode, isGuidedMode, transactionType, setIsGuidedMode, setTransactionType]);

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
