import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { ModeHandle, ModeHandleVoiceParams } from '@/src/features/journal/entry/modes/ModeHandle';
import { useRegisterModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import Account from '@/src/data/models/Account';
import { AccountRole } from '@/src/types/domain';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

export type GuidedModePanelProps = {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  onSelectAccountRequest: (lineId: string) => void;
};

export function GuidedModePanel({
  accounts,
  editor,
  onSelectAccountRequest,
}: GuidedModePanelProps) {
  const [isAmountFocused, setIsAmountFocused] = useState(false);

  const simpleEditor = useSimpleJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest: (role: AccountRole) => {
      const lineId = editor.getLineIdByRole(role);
      if (lineId) {
        onSelectAccountRequest(lineId);
      }
    },
  });

  const isSimpleValid =
    simpleEditor.isValidAmount &&
    !!simpleEditor.sourceId &&
    !!simpleEditor.destinationId &&
    simpleEditor.sourceId !== simpleEditor.destinationId &&
    !simpleEditor.isSubmitting &&
    !simpleEditor.isLoadingRate &&
    !simpleEditor.rateError;

  const submit = useCallback(() => {
    if (isAmountFocused && !isSimpleValid) {
      Keyboard.dismiss();
    } else {
      void simpleEditor.handleSave();
    }
  }, [isAmountFocused, isSimpleValid, simpleEditor]);

  const onFocusAmount = useCallback(() => setIsAmountFocused(true), []);
  const onBlurAmount = useCallback(() => setIsAmountFocused(false), []);

  const applyVoice = useCallback(
    (params: ModeHandleVoiceParams) => {
      const mappedType =
        params.transactionType || (params.direction === 'credit' ? 'income' : 'expense');
      simpleEditor.setType(mappedType);
      if (params.amount) {
        simpleEditor.setAmount(String(params.amount));
      }
      if (mappedType === 'income') {
        if (params.categoryAccountId) simpleEditor.setSourceId(params.categoryAccountId);
        if (params.sourceAccountId) simpleEditor.setDestinationId(params.sourceAccountId);
      } else {
        if (params.sourceAccountId) simpleEditor.setSourceId(params.sourceAccountId);
        if (params.categoryAccountId) simpleEditor.setDestinationId(params.categoryAccountId);
      }
    },
    [simpleEditor],
  );

  const footerAmount = useMemo(
    () => ({
      amount: simpleEditor.amount,
      setAmount: simpleEditor.setAmount,
      accentType: simpleEditor.type,
      displayCurrency: simpleEditor.displayCurrency,
      onFocus: onFocusAmount,
      onBlur: onBlurAmount,
    }),
    [
      simpleEditor.amount,
      simpleEditor.setAmount,
      simpleEditor.type,
      simpleEditor.displayCurrency,
      onFocusAmount,
      onBlurAmount,
    ],
  );

  const handle = useMemo<ModeHandle>(
    () => ({
      submitLabel: resolveJournalEntrySubmitLabel({
        activeMode: 'guided',
        bulkSubmitting: false,
        bulkRowCount: 0,
        isAmountFocused,
        isSimpleValid,
        simpleSubmitting: simpleEditor.isSubmitting,
        simpleType: simpleEditor.type,
        isEdit: editor.isEdit,
        isSubmitting: editor.isSubmitting,
      }),
      isSubmitDisabled: isJournalEntrySubmitDisabled({
        activeMode: 'guided',
        bulkSubmitting: false,
        bulkValid: false,
        isAmountFocused,
        isSimpleValid,
        isAdvancedValid: false,
      }),
      submit,
      applyVoice,
      footerAmount,
    }),
    [
      isAmountFocused,
      isSimpleValid,
      simpleEditor.isSubmitting,
      simpleEditor.type,
      editor.isEdit,
      editor.isSubmitting,
      submit,
      applyVoice,
      footerAmount,
    ],
  );

  useRegisterModeHandle(handle);

  return <SimpleForm {...simpleEditor} />;
}
