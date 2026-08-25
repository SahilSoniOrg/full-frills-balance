import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { VoiceInputModal } from '@/src/features/journal/entry/components/VoiceInputModal';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import type { VoiceJournalApplyParams } from '@/src/features/journal/entry/hooks/useVoiceJournalParse';
import {
  isJournalEntrySubmitDisabled,
  resolveJournalEntrySubmitLabel,
  resolveSimpleTypeAccentColor,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { applyJournalLineAccountSelection } from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import type { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import type { AccountFields } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { MutableRefObject, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

export type GuidedFooterAmount = {
  amount: string;
  setAmount: (amount: string) => void;
  accentType: TabType;
  displayCurrency: string;
  onFocus: () => void;
  onBlur: () => void;
  precision: number;
};

export type GuidedVoiceActions = {
  open: () => void;
};

export type GuidedVoiceApplyParams = VoiceJournalApplyParams;

export type GuidedModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceId: WorkplaceId;
  onSelectAccountRequest: (lineId: string) => void;
  /** Shell footer top slot — guided amount chrome (not ModeHandle). */
  onFooterAmountChange?: (footer: GuidedFooterAmount | null) => void;
  /** MetaCard mic opens Guided-owned VoiceInputModal via this ref. */
  voiceActionsRef?: MutableRefObject<GuidedVoiceActions | null>;
  isActive?: boolean;
  onModeHandleChange: (handle: ModeHandle | null) => void;
};

export function GuidedModePanel({
  accounts,
  editor,
  workplaceId,
  onSelectAccountRequest,
  onFooterAmountChange,
  voiceActionsRef,
  isActive = true,
  onModeHandleChange,
}: GuidedModePanelProps) {
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);

  const { getLineIdByRole } = editor;

  const requestAccountForRole = useCallback(
    (role: AccountRole) => {
      const lineId = getLineIdByRole(role);
      if (lineId) {
        onSelectAccountRequest(lineId);
      }
    },
    [getLineIdByRole, onSelectAccountRequest],
  );

  const simpleEditor = useSimpleJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest: requestAccountForRole,
  });
  const { precision } = useCurrencyPrecision(simpleEditor.displayCurrency);

  const { handleSave } = simpleEditor;

  const applyAccountToLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      applyJournalLineAccountSelection({
        lineId,
        accountId,
        accounts,
        updateLine: editor.updateLine,
      });
    },
    [accounts, editor.updateLine],
  );

  const resolveSelectedAccountId = useCallback(
    (lineId: string) => editor.lines.find(line => line.id === lineId)?.accountId,
    [editor.lines],
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
      void handleSave();
    }
  }, [isAmountFocused, isSimpleValid, handleSave]);

  const onFocusAmount = useCallback(() => setIsAmountFocused(true), []);
  const onBlurAmount = useCallback(() => setIsAmountFocused(false), []);
  const footerAmount = useMemo<GuidedFooterAmount>(
    () => ({
      amount: simpleEditor.amount,
      setAmount: simpleEditor.setAmount,
      accentType: simpleEditor.type,
      displayCurrency: simpleEditor.displayCurrency,
      precision,
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
      precision,
    ],
  );

  useEffect(() => {
    if (!isActive) return;
    onFooterAmountChange?.(footerAmount);
    return () => onFooterAmountChange?.(null);
  }, [footerAmount, isActive, onFooterAmountChange]);

  const openVoice = useCallback(() => setIsVoiceModalVisible(true), []);

  useEffect(() => {
    if (!isActive || !voiceActionsRef) return;
    voiceActionsRef.current = { open: openVoice };
    return () => {
      voiceActionsRef.current = null;
    };
  }, [isActive, voiceActionsRef, openVoice]);

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

  useEffect(() => {
    if (!isActive) return;
    onModeHandleChange(handle);
    return () => onModeHandleChange(null);
  }, [handle, isActive, onModeHandleChange]);

  return (
    <>
      <SimpleForm
        type={simpleEditor.type}
        setType={simpleEditor.setType}
        amount={simpleEditor.amount}
        sourceId={simpleEditor.sourceId}
        destinationId={simpleEditor.destinationId}
        exchangeRate={simpleEditor.exchangeRate}
        isLoadingRate={simpleEditor.isLoadingRate}
        rateError={simpleEditor.rateError}
        isCrossCurrency={simpleEditor.isCrossCurrency}
        convertedAmount={simpleEditor.convertedAmount}
        sourceCurrency={simpleEditor.sourceCurrency}
        destCurrency={simpleEditor.destCurrency}
        openAccountPicker={simpleEditor.openAccountPicker}
        accountSections={simpleEditor.accountSections}
      />
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
      precision={footerAmount.precision}
      variant="default"
    />
  );
}
