import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import { SimpleFormAmountInput } from '@/src/features/journal/entry/components/SimpleFormAmountInput';
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
import { AccountRole, TabType } from '@/src/types/domain';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

export type GuidedFooterAmount = {
  amount: string;
  setAmount: (amount: string) => void;
  accentType: TabType;
  displayCurrency: string;
  onFocus: () => void;
  onBlur: () => void;
};

export type GuidedModePanelProps = {
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  onSelectAccountRequest: (lineId: string) => void;
  /** Shell footer top slot — guided amount chrome (not ModeHandle). */
  onFooterAmountChange?: (footer: GuidedFooterAmount | null) => void;
};

export function GuidedModePanel({
  accounts,
  editor,
  onSelectAccountRequest,
  onFooterAmountChange,
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
    }),
    [
      isAmountFocused,
      isSimpleValid,
      simpleEditor.isSubmitting,
      simpleEditor.type,
      editor.isEdit,
      editor.isSubmitting,
      submit,
    ],
  );

  useRegisterModeHandle(handle);

  return <SimpleForm {...simpleEditor} />;
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
