import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import type { JournalEntryShell } from './useJournalEntryShell';
import { useCallback, useState } from 'react';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntryValidationHint,
  resolveJournalEntrySubmitLabel,
} from '../journalEntryPresentation';

export function useJournalEntryPresentationState(vm: JournalEntryShell) {
  const [hideSuggestions, setHideSuggestions] = useState(false);
  const { editor, loadSuggestions, onSelectSuggestion: applySuggestion } = vm;
  const isSubmitting = vm.editor.isSubmitting;
  const isBatchMode = vm.activeMode === 'batch';
  const isPlanValid =
    vm.activeMode === 'allocation' ? vm.splitValidation.valid : vm.postingPlanValidation.valid;
  const submitLabel = resolveJournalEntrySubmitLabel({
    activeMode: vm.activeMode,
    simpleType: vm.editor.transactionType,
    isEdit: vm.editor.isEdit,
    isSubmitting,
  });
  const isSubmitDisabled = isJournalEntrySubmitDisabled({
    activeMode: vm.activeMode,
    isPlanValid,
    isSplitValid: vm.splitValidation.valid,
  });
  const missingRequirementHint = isSubmitDisabled
    ? resolveJournalEntryValidationHint({
        activeMode: vm.activeMode,
        validationIssues: vm.validationIssues,
        splitValidation: vm.splitValidation,
      })
    : null;
  const batchSubmitDisabled = !vm.batchEditor.isValid || vm.batchEditor.isSubmitting;
  const onScrollBeginDrag = useCallback(() => setHideSuggestions(true), []);
  const onDescriptionFocus = useCallback(() => {
    setHideSuggestions(false);
    loadSuggestions();
  }, [loadSuggestions]);
  const setDescription = useCallback(
    (desc: string) => {
      setHideSuggestions(false);
      loadSuggestions();
      editor.setDescription(desc);
    },
    [editor, loadSuggestions],
  );
  const onSelectSuggestion = useCallback(
    (suggestion: JournalAutofillSuggestion) => {
      setHideSuggestions(false);
      return applySuggestion(suggestion);
    },
    [applySuggestion],
  );
  return {
    hideSuggestions,
    isSubmitting,
    isBatchMode,
    submitLabel,
    isSubmitDisabled,
    missingRequirementHint,
    batchSubmitDisabled,
    onScrollBeginDrag,
    onDescriptionFocus,
    setDescription,
    onSelectSuggestion,
  };
}
