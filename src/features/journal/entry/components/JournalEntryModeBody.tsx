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
import type { AccountFields } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { MutableRefObject } from 'react';

export type JournalEntryModeBodyProps = {
  activeMode: JournalEntryScreenMode;
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  onSelectAccountRequest: (lineId: string) => void;
  onGuidedFooterAmountChange: (footer: GuidedFooterAmount | null) => void;
  guidedVoiceActionsRef: MutableRefObject<GuidedVoiceActions | null>;
  batchEditor: ReturnType<typeof useBulkJournalEditor>;
  batchSummary: { count: number; items: SavedJournalSummary[] } | null;
  onContinueBatch: () => void;
  onDoneBatch: () => void;
};

/** Mounts only the active view; durable drafts live in the shell. */
export function JournalEntryModeBody({
  activeMode,
  accounts,
  editor,
  workplaceId,
  workplaceCurrency,
  onSelectAccountRequest,
  onGuidedFooterAmountChange,
  guidedVoiceActionsRef,
  batchEditor,
  batchSummary,
  onContinueBatch,
  onDoneBatch,
}: JournalEntryModeBodyProps) {
  if (activeMode === 'batch') {
    return (
      <BatchModePanel
        editor={batchEditor}
        accounts={accounts}
        summary={batchSummary}
        onContinue={onContinueBatch}
        onDone={onDoneBatch}
      />
    );
  }
  if (activeMode === 'allocation') {
    return (
      <SplitModePanel
        accounts={accounts}
        editor={editor}
        onSelectAccountRequest={onSelectAccountRequest}
        isActive
      />
    );
  }

  if (activeMode === 'expert') {
    return (
      <AdvancedModePanel
        editor={editor}
        workplaceCurrency={workplaceCurrency}
        onSelectAccountRequest={onSelectAccountRequest}
      />
    );
  }

  return (
    <GuidedModePanel
      accounts={accounts}
      editor={editor}
      workplaceId={workplaceId}
      onSelectAccountRequest={onSelectAccountRequest}
      onFooterAmountChange={onGuidedFooterAmountChange}
      voiceActionsRef={guidedVoiceActionsRef}
      isActive
    />
  );
}
