import type { PersonPickerGroup } from '@/src/components/account-selection/personAccountGrouping';
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
import type { AccountId, OpenItemId, PersonId } from '@/src/types/ids';
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
  peopleGroups?: readonly PersonPickerGroup[];
  /** Controlled by the screen because JournalMetaCard owns the voice trigger. */
  voiceModalVisible: boolean;
  onVoiceModalVisibleChange: (visible: boolean) => void;
  onScrollBeginDrag?: () => void;
  onCalculatorDone?: () => void;
  accountFlowRef?: RefObject<AccountFlowHandle | null>;
  initialOpenItemId?: OpenItemId;
  onCreatePersonRequest?: () => void;
  onTransferOpenItemPlanChange?: (
    plan: {
      personId: PersonId;
      targetAccountId: AccountId;
      allocationMode: 'fifo' | 'pick';
      allocations: readonly { openItemId: OpenItemId; amount: number }[];
    } | null,
  ) => void;
};

export function SimpleModePanel({
  accounts,
  editor,
  guidedAutopilot,
  onCreateAccountForTarget,
  onSelectAccountRequest,
  workplaceId,
  workplaceCurrency,
  peopleGroups,
  voiceModalVisible,
  onVoiceModalVisibleChange,
  meta,
  onScrollBeginDrag,
  onCalculatorDone,
  accountFlowRef,
  initialOpenItemId,
  onCreatePersonRequest,
  onTransferOpenItemPlanChange,
}: SimpleModePanelProps) {
  const { theme } = useTheme();
  const { simpleEditor, precision, handleApplyVoiceInput, autopilotActive, firstAutopilotRole } =
    useGuidedModeController({
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
          editor={simpleEditor}
          meta={meta}
          peopleGroups={peopleGroups}
          onScrollBeginDrag={onScrollBeginDrag}
          accentColor={activeColor}
          precision={precision}
          onCreateAccountRequest={(role, intent) =>
            onCreateAccountForTarget({ kind: 'role', role }, intent)
          }
          autoFocusAmount={autopilotActive}
          autopilotFirstRole={firstAutopilotRole}
          onCalculatorDone={onCalculatorDone}
          accountFlowRef={accountFlowRef}
          workplaceId={workplaceId}
          workplaceCurrency={workplaceCurrency}
          initialOpenItemId={initialOpenItemId}
          onCreatePersonRequest={onCreatePersonRequest}
          onTransferOpenItemPlanChange={onTransferOpenItemPlanChange}
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
