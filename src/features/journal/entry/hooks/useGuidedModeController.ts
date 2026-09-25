import type { JournalEntryAccountPickerRequestOptions } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { useGuidedVoiceApplication } from '@/src/features/journal/entry/hooks/useGuidedVoiceApplication';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import type { AccountRole } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import { useCallback, useMemo } from 'react';

type GuidedModeControllerOptions = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  guidedAutopilot: boolean;
  onSelectAccountRequest: (
    lineId: string,
    options?: JournalEntryAccountPickerRequestOptions,
  ) => void;
};

/** Canonical controller shared by every visual treatment of simple journal entry. */
export function useGuidedModeController({
  accounts,
  editor,
  guidedAutopilot,
  onSelectAccountRequest,
}: GuidedModeControllerOptions) {
  const { getLineIdByRole } = editor;
  const requestAccountForRole = useCallback(
    (role: AccountRole, requestOptions?: JournalEntryAccountPickerRequestOptions) => {
      const lineId = getLineIdByRole(role);
      if (lineId) onSelectAccountRequest(lineId, requestOptions);
    },
    [getLineIdByRole, onSelectAccountRequest],
  );

  const simpleEditor = useSimpleJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest: requestAccountForRole,
  });
  const { precision } = useCurrencyPrecision(simpleEditor.displayCurrency);
  const handleApplyVoiceInput = useGuidedVoiceApplication(editor, simpleEditor);
  const autopilotActive = guidedAutopilot && !editor.isEdit && !simpleEditor.amount;
  const firstAutopilotRole =
    guidedAutopilot && !editor.isEdit ? simpleEditor.accountSections[0]?.role : undefined;

  return useMemo(
    () => ({
      simpleEditor,
      swapAccounts: simpleEditor.swapAccounts,
      precision,
      handleApplyVoiceInput,
      autopilotActive,
      firstAutopilotRole,
    }),
    [autopilotActive, firstAutopilotRole, handleApplyVoiceInput, precision, simpleEditor],
  );
}
