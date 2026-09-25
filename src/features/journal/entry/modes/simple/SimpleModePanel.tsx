import { Spacing } from '@/src/constants/design-tokens';
import { VoiceInputModal } from '@/src/features/journal/entry/components/VoiceInputModal';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import type { JournalMetaCardProps } from '@/src/features/journal/entry/components/JournalMetaCard';
import type { AccountFlowHandle } from '@/src/features/journal/entry/components/useSimpleFormExpansion';
import { useGuidedModeController } from '@/src/features/journal/entry/hooks/useGuidedModeController';
import type { JournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { resolveSimpleTypeAccentColor } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

export type SimpleModePanelProps = Pick<
  JournalEntryShell,
  | 'accounts'
  | 'editor'
  | 'guidedAutopilot'
  | 'onCreateAccountForTarget'
  | 'onSelectAccountRequest'
  | 'workplaceCurrency'
  | 'workplaceId'
> & {
  meta: JournalMetaCardProps;
  /** Controlled by the screen because JournalMetaCard owns the voice trigger. */
  voiceModalVisible: boolean;
  onVoiceModalVisibleChange: (visible: boolean) => void;
  onScrollBeginDrag?: () => void;
  onCalculatorDone?: () => void;
  accountFlowRef?: RefObject<AccountFlowHandle | null>;
};

export function SimpleModePanel({
  accounts,
  editor,
  guidedAutopilot,
  onCreateAccountForTarget,
  onSelectAccountRequest,
  workplaceId,
  voiceModalVisible,
  onVoiceModalVisibleChange,
  meta,
  onScrollBeginDrag,
  onCalculatorDone,
  accountFlowRef,
}: SimpleModePanelProps) {
  const { theme } = useTheme();
  const {
    simpleEditor,
    precision,
    handleApplyVoiceInput,
    autopilotActive,
    firstAutopilotRole,
    swapAccounts,
  } = useGuidedModeController({
    accounts,
    editor,
    guidedAutopilot,
    onSelectAccountRequest,
  });
  const activeColor = resolveSimpleTypeAccentColor(simpleEditor.type, theme);

  return (
    <>
      <View style={styles.container}>
        <SimpleForm
          meta={meta}
          setType={simpleEditor.setType}
          onScrollBeginDrag={onScrollBeginDrag}
          type={simpleEditor.type}
          amount={simpleEditor.amount}
          setAmount={simpleEditor.setAmount}
          currency={simpleEditor.displayCurrency}
          accentColor={activeColor}
          precision={precision}
          accounts={accounts}
          accountSections={simpleEditor.accountSections}
          sourceId={simpleEditor.sourceId}
          destinationId={simpleEditor.destinationId}
          onSwapAccounts={swapAccounts}
          onCreateAccountRequest={(role, intent) =>
            onCreateAccountForTarget({ kind: 'role', role }, intent)
          }
          fxPair={simpleEditor.fxPair}
          setManualBaseRate={simpleEditor.setManualBaseRate}
          setConvertedAmount={simpleEditor.setConvertedAmount}
          resetToApiRate={simpleEditor.resetToApiRate}
          autoOpenCalculator={autopilotActive}
          autopilotFirstRole={firstAutopilotRole}
          onCalculatorDone={onCalculatorDone}
          accountFlowRef={accountFlowRef}
        />
      </View>

      <VoiceInputModal
        visible={voiceModalVisible}
        onClose={() => onVoiceModalVisibleChange(false)}
        onApply={handleApplyVoiceInput}
        workplaceId={workplaceId}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: Spacing.xs,
  },
});
