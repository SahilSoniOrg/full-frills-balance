import { AppConfig } from '@/src/constants';
import { Spacing } from '@/src/constants/design-tokens';
import { Icon, AppSegmentedControl } from '@/src/components/core';
import { VoiceInputModal } from '@/src/features/journal/entry/components/VoiceInputModal';
import { SimpleForm } from '@/src/features/journal/entry/components/SimpleForm';
import type { AccountFlowHandle } from '@/src/features/journal/entry/components/useSimpleFormExpansion';
import { useGuidedModeController } from '@/src/features/journal/entry/hooks/useGuidedModeController';
import type { JournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { resolveSimpleTypeAccentColor } from '@/src/features/journal/entry/journalEntryPresentation';
import { useTheme } from '@/src/hooks/use-theme';
import type { TabType } from '@/src/types/domainJournal';
import type { ReactNode, RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

export type SimpleModePanelProps = Pick<
  JournalEntryShell,
  | 'accounts'
  | 'editor'
  | 'guidedAutopilot'
  | 'onCreateAccountRequestForRole'
  | 'onSelectAccountRequest'
  | 'workplaceCurrency'
  | 'workplaceId'
> & {
  /** Controlled by the screen because JournalMetaCard owns the voice trigger. */
  voiceModalVisible: boolean;
  onVoiceModalVisibleChange: (visible: boolean) => void;
  leadingContent: ReactNode;
  onScrollBeginDrag?: () => void;
  onCalculatorDone?: () => void;
  accountFlowRef?: RefObject<AccountFlowHandle | null>;
};

export function SimpleModePanel({
  accounts,
  editor,
  guidedAutopilot,
  onCreateAccountRequestForRole,
  onSelectAccountRequest,
  workplaceCurrency,
  workplaceId,
  voiceModalVisible,
  onVoiceModalVisibleChange,
  leadingContent,
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
          leadingContent={
            <>
              {leadingContent}
              <View style={styles.typeTabsWrapper}>
                <AppSegmentedControl
                  options={[
                    {
                      id: 'expense',
                      label: AppConfig.strings.journal.expense,
                      icon: Icon.ArrowDown,
                    },
                    {
                      id: 'income',
                      label: AppConfig.strings.journal.income,
                      icon: Icon.ArrowUp,
                    },
                    {
                      id: 'transfer',
                      label: AppConfig.strings.journal.transfer,
                      icon: Icon.SwapHorizontal,
                    },
                  ]}
                  value={simpleEditor.type}
                  onChange={next => simpleEditor.setType(next as TabType)}
                  size="md"
                  flex
                  trackColor={theme.surfaceSecondary}
                  pillColor={theme.surface}
                  activeTextColor={activeColor}
                  inactiveTextColor={theme.textSecondary}
                />
              </View>
            </>
          }
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
          onCreateAccountRequest={onCreateAccountRequestForRole}
          isCrossCurrency={simpleEditor.isCrossCurrency}
          exchangeRate={simpleEditor.exchangeRate}
          isLoadingRate={simpleEditor.isLoadingRate}
          rateError={simpleEditor.rateError}
          convertedAmount={simpleEditor.convertedAmount}
          sourceCurrency={simpleEditor.sourceCurrency}
          destCurrency={simpleEditor.destCurrency}
          workplaceCurrency={workplaceCurrency}
          needsWorkplaceRate={simpleEditor.needsWorkplaceRate}
          showManualRateFields={simpleEditor.showManualRateFields}
          manualSourceBaseRate={simpleEditor.manualSourceBaseRate}
          manualDestBaseRate={simpleEditor.manualDestBaseRate}
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
  typeTabsWrapper: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
});
