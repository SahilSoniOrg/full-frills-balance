import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { AdvancedModePanel } from '@/src/features/journal/entry/modes/advanced/AdvancedModePanel';
import {
  GuidedFooterAmount,
  GuidedModePanel,
  GuidedVoiceActions,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { SplitModePanel } from '@/src/features/journal/entry/modes/split/SplitModePanel';
import { BatchModePanel } from '@/src/features/journal/entry/modes/batch/BatchModePanel';
import type { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import type { JournalEntryAccountPickerRequestOptions } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import type { AccountFields } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { ChromeMotion } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { MotiView } from 'moti';
import { MutableRefObject, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

export type JournalEntryModeBodyProps = {
  activeMode: JournalEntryScreenMode;
  guidedAutopilot: boolean;
  /** +1 when moving toward expert/batch, -1 when moving toward basic. */
  modeTransitionDir: 1 | -1;
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  onSelectAccountRequest: (
    lineId: string,
    options?: JournalEntryAccountPickerRequestOptions,
  ) => void;
  onGuidedFooterAmountChange: (footer: GuidedFooterAmount | null) => void;
  guidedVoiceActionsRef: MutableRefObject<GuidedVoiceActions | null>;
  onGuidedDescriptionFocus?: () => void;
  batchEditor: ReturnType<typeof useBulkJournalEditor>;
  batchSummary: { count: number; items: SavedJournalSummary[] } | null;
  onContinueBatch: () => void;
  onDoneBatch: () => void;
};

/** Mounts only the active view; durable drafts live in the shell. */
export function JournalEntryModeBody({
  activeMode,
  guidedAutopilot,
  modeTransitionDir,
  accounts,
  editor,
  workplaceId,
  workplaceCurrency,
  onSelectAccountRequest,
  onGuidedFooterAmountChange,
  guidedVoiceActionsRef,
  onGuidedDescriptionFocus,
  batchEditor,
  batchSummary,
  onContinueBatch,
  onDoneBatch,
}: JournalEntryModeBodyProps) {
  const reduceMotion = useReducedMotion();

  let panel: ReactNode;
  if (activeMode === 'batch') {
    panel = (
      <BatchModePanel
        editor={batchEditor}
        accounts={accounts}
        workplaceCurrency={workplaceCurrency}
        summary={batchSummary}
        onContinue={onContinueBatch}
        onDone={onDoneBatch}
      />
    );
  } else if (activeMode === 'allocation') {
    panel = (
      <SplitModePanel
        accounts={accounts}
        editor={editor}
        onSelectAccountRequest={onSelectAccountRequest}
      />
    );
  } else if (activeMode === 'expert') {
    panel = (
      <AdvancedModePanel
        editor={editor}
        workplaceCurrency={workplaceCurrency}
        onSelectAccountRequest={onSelectAccountRequest}
      />
    );
  } else {
    panel = (
      <GuidedModePanel
        accounts={accounts}
        editor={editor}
        workplaceId={workplaceId}
        guidedAutopilot={guidedAutopilot}
        onSelectAccountRequest={onSelectAccountRequest}
        onFooterAmountChange={onGuidedFooterAmountChange}
        voiceActionsRef={guidedVoiceActionsRef}
        onFocusDescription={onGuidedDescriptionFocus}
      />
    );
  }

  if (reduceMotion) return <>{panel}</>;

  // Enter-only: AnimatePresence kept the exiting panel in document flow,
  // which stacked both modes and made the incoming panel load below then snap up.
  const slide = ChromeMotion.panelSlidePx * modeTransitionDir;

  return (
    <MotiView
      key={activeMode}
      from={{
        opacity: 0,
        translateX: slide,
        scale: ChromeMotion.panelFromScale,
      }}
      animate={{ opacity: 1, translateX: 0, scale: 1 }}
      transition={ChromeMotion.panel}
      style={styles.panel}
      pointerEvents="box-none"
    >
      {panel}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
  },
});
