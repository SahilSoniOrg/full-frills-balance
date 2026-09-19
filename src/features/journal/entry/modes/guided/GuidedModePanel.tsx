import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
import { VoiceInputModal } from '@/src/features/journal/entry/components/VoiceInputModal';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import type { JournalEntryAccountPickerRequestOptions } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { useGuidedModeController } from '@/src/features/journal/entry/hooks/useGuidedModeController';
import { resolveSimpleTypeAccentColor } from '@/src/features/journal/entry/journalEntryPresentation';
import type { AccountFields } from '@/src/types/plainDtos';
import { useTheme } from '@/src/hooks/use-theme';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { WorkplaceId } from '@/src/types/ids';
import { TabType } from '@/src/types/domainJournal';
import { MutableRefObject, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

export type GuidedFooterAmount = {
  amount: string;
  setAmount: (amount: string) => void;
  accentType: TabType;
  displayCurrency: string;
  precision: number;
  autoOpenCalculator: boolean;
  onCalculatorDone?: () => void;
};

export type GuidedVoiceActions = {
  open: () => void;
};

export type GuidedModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceId: WorkplaceId;
  guidedAutopilot: boolean;
  onSelectAccountRequest: (
    lineId: string,
    options?: JournalEntryAccountPickerRequestOptions,
  ) => void;
  /** Shell footer top slot — basic amount chrome. */
  onFooterAmountChange?: (footer: GuidedFooterAmount | null) => void;
  /** MetaCard mic opens Guided-owned VoiceInputModal via this ref. */
  voiceActionsRef?: MutableRefObject<GuidedVoiceActions | null>;
  /** Focuses the description field after amount entry completes. */
  onFocusDescription?: () => void;
};

export function GuidedModePanel({
  accounts,
  editor,
  workplaceId,
  guidedAutopilot,
  onSelectAccountRequest,
  onFooterAmountChange,
  voiceActionsRef,
  onFocusDescription,
}: GuidedModePanelProps) {
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const {
    simpleEditor,
    precision,
    handleApplyVoiceInput,
    autopilotActive,
    onAutopilotCalculatorDone,
  } = useGuidedModeController({
    accounts,
    editor,
    guidedAutopilot,
    onSelectAccountRequest,
    onFocusDescription,
  });
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const footerAmount = useMemo<GuidedFooterAmount>(
    () => ({
      amount: simpleEditor.amount,
      setAmount: simpleEditor.setAmount,
      accentType: simpleEditor.type,
      displayCurrency: simpleEditor.displayCurrency,
      precision,
      autoOpenCalculator: autopilotActive,
      onCalculatorDone: onAutopilotCalculatorDone,
    }),
    [autopilotActive, onAutopilotCalculatorDone, precision, simpleEditor],
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
        workplaceCurrency={workplaceCurrency}
        needsWorkplaceRate={simpleEditor.needsWorkplaceRate}
        showManualRateFields={simpleEditor.showManualRateFields}
        manualSourceBaseRate={simpleEditor.manualSourceBaseRate}
        manualDestBaseRate={simpleEditor.manualDestBaseRate}
        setManualBaseRate={simpleEditor.setManualBaseRate}
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
      autoOpenCalculator={footerAmount.autoOpenCalculator}
      onCalculatorDone={footerAmount.onCalculatorDone}
      variant="default"
    />
  );
}
