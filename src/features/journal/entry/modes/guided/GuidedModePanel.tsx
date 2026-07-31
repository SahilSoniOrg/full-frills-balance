import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { VoiceInputModal } from '@/src/features/journal/entry/components/VoiceInputModal';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
  resolveSimpleTypeAccentColor,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import { useRegisterModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId, AccountRole, TabType, WorkplaceId } from '@/src/types/domain';
import { MutableRefObject, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

export type GuidedFooterAmount = {
  amount: string;
  setAmount: (amount: string) => void;
  accentType: TabType;
  displayCurrency: string;
  onFocus: () => void;
  onBlur: () => void;
};

export type GuidedVoiceActions = {
  open: () => void;
};

export type GuidedVoiceApplyParams = {
  amount?: number;
  merchantName?: string;
  direction: 'debit' | 'credit' | 'unknown';
  transactionType?: 'expense' | 'income' | 'transfer';
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  transcription: string;
};

export type GuidedModePanelProps = {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceId: WorkplaceId;
  onSelectAccountRequest: (lineId: string) => void;
  /** Shell footer top slot — guided amount chrome (not ModeHandle). */
  onFooterAmountChange?: (footer: GuidedFooterAmount | null) => void;
  /** MetaCard mic opens Guided-owned VoiceInputModal via this ref. */
  voiceActionsRef?: MutableRefObject<GuidedVoiceActions | null>;
};

export function GuidedModePanel({
  accounts,
  editor,
  workplaceId,
  onSelectAccountRequest,
  onFooterAmountChange,
  voiceActionsRef,
}: GuidedModePanelProps) {
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);

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

  const applyAccountToLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      const line = editor.lines.find(candidate => candidate.id === lineId);
      if (!line) return;
      if (line.transactionType === 'CREDIT') simpleEditor.setSourceId(accountId);
      else simpleEditor.setDestinationId(accountId);
    },
    [editor.lines, simpleEditor.setDestinationId, simpleEditor.setSourceId],
  );

  const resolveSelectedAccountId = useCallback(
    (lineId: string) => {
      const line = editor.lines.find(candidate => candidate.id === lineId);
      if (!line) return undefined;
      return line.transactionType === 'CREDIT' ? simpleEditor.sourceId : simpleEditor.destinationId;
    },
    [editor.lines, simpleEditor.destinationId, simpleEditor.sourceId],
  );

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

  const footerAmount = useMemo<GuidedFooterAmount>(
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

  useEffect(() => {
    onFooterAmountChange?.(footerAmount);
    return () => onFooterAmountChange?.(null);
  }, [footerAmount, onFooterAmountChange]);

  const openVoice = useCallback(() => setIsVoiceModalVisible(true), []);

  useEffect(() => {
    if (!voiceActionsRef) return;
    voiceActionsRef.current = { open: openVoice };
    return () => {
      voiceActionsRef.current = null;
    };
  }, [voiceActionsRef, openVoice]);

  const handleApplyVoiceInput = useCallback(
    (params: GuidedVoiceApplyParams) => {
      if (params.merchantName) {
        editor.setDescription(params.merchantName);
      }
      if (params.transcription) {
        editor.setNotes(`Spoken transcript: ${params.transcription}`);
      }

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
    [editor, simpleEditor],
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
      applyAccountToLine,
      resolveSelectedAccountId,
    }),
    [
      isAmountFocused,
      isSimpleValid,
      simpleEditor.isSubmitting,
      simpleEditor.type,
      editor.isEdit,
      editor.isSubmitting,
      submit,
      applyAccountToLine,
      resolveSelectedAccountId,
    ],
  );

  useRegisterModeHandle(handle);

  return (
    <>
      <SimpleForm {...simpleEditor} />
      <VoiceInputModal
        visible={isVoiceModalVisible}
        onClose={() => setIsVoiceModalVisible(false)}
        onApply={handleApplyVoiceInput}
        workplaceId={workplaceId}
      />
    </>
  );
}

/** Renders guided amount strip for SubmitFooter topSlot from shell-held chrome. */
export function GuidedFooterAmountSlot({
  footerAmount,
}: {
  footerAmount: GuidedFooterAmount;
}): ReactNode {
  const { theme } = useTheme();
  return (
    <SimpleFormAmountInput
      amount={footerAmount.amount}
      setAmount={footerAmount.setAmount}
      readOnly={false}
      activeColor={resolveSimpleTypeAccentColor(footerAmount.accentType, theme)}
      displayCurrency={footerAmount.displayCurrency}
      onFocus={footerAmount.onFocus}
      onBlur={footerAmount.onBlur}
      variant="default"
    />
  );
}
