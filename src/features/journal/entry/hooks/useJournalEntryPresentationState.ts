import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import type { JournalEntryShell } from './useJournalEntryShell';
import type { JournalEntryModeBodyProps } from '../components/JournalEntryModeBody';
import { useCallback, useState } from 'react';
import {
  isJournalEntrySubmitDisabled,
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
    simpleSubmitting: isSubmitting,
    simpleType: vm.editor.transactionType,
    isEdit: vm.editor.isEdit,
    isSubmitting,
    splitSubmitting: isSubmitting,
  });
  const isSubmitDisabled = isJournalEntrySubmitDisabled({
    activeMode: vm.activeMode,
    isSimpleValid: isPlanValid,
    isAdvancedValid: isPlanValid,
    isSplitValid: vm.splitValidation.valid,
  });
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
      applySuggestion(suggestion);
    },
    [applySuggestion],
  );
  const modeBodyProps: JournalEntryModeBodyProps = {
    activeMode: vm.activeMode,
    accounts: vm.accounts,
    editor: vm.editor,
    workplaceId: vm.workplaceId,
    workplaceCurrency: vm.workplaceCurrency,
    onSelectAccountRequest: vm.onSelectAccountRequest,
    onGuidedFooterAmountChange: vm.onGuidedFooterAmountChange,
    guidedVoiceActionsRef: vm.guidedVoiceActionsRef,
    batchEditor: vm.batchEditor,
    batchSummary: vm.batchSummary,
    onContinueBatch: vm.onContinueBatch,
    onDoneBatch: vm.onDoneBatch,
  };
  return {
    hideSuggestions,
    isSubmitting,
    isBatchMode,
    submitLabel,
    isSubmitDisabled,
    batchSubmitDisabled,
    onScrollBeginDrag,
    onDescriptionFocus,
    setDescription,
    onSelectSuggestion,
    modeBodyProps,
  };
}
