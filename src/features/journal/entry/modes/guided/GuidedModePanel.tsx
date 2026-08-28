import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { VoiceInputModal } from '@/src/features/journal/entry/components/VoiceInputModal';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { useGuidedVoiceApplication } from '@/src/features/journal/entry/hooks/useGuidedVoiceApplication';
import type { VoiceJournalApplyParams } from '@/src/features/journal/entry/hooks/useVoiceJournalParse';
import { resolveSimpleTypeAccentColor } from '@/src/features/journal/entry/journalEntryPresentation';
import type { AccountFields } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { WorkplaceId } from '@/src/types/ids';
import { AccountRole, TabType } from '@/src/types/domainJournal';
import { MutableRefObject, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

export type GuidedFooterAmount = {
  amount: string;
  setAmount: (amount: string) => void;
  accentType: TabType;
  displayCurrency: string;
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
  /** Shell footer top slot — basic amount chrome. */
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

  const footerAmount = useMemo<GuidedFooterAmount>(
    () => ({
      amount: simpleEditor.amount,
      setAmount: simpleEditor.setAmount,
      accentType: simpleEditor.type,
      displayCurrency: simpleEditor.displayCurrency,
      precision,
    }),
    [
      simpleEditor.amount,
      simpleEditor.setAmount,
      simpleEditor.type,
      simpleEditor.displayCurrency,
      precision,
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

  const handleApplyVoiceInput = useGuidedVoiceApplication(editor, simpleEditor);

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

/** Renders basic amount strip for SubmitFooter topSlot from shell-held chrome. */
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
      precision={footerAmount.precision}
      variant="default"
    />
  );
}
