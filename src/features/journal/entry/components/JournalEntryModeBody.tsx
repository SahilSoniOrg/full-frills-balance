import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { AdvancedModePanel } from '@/src/features/journal/entry/modes/advanced/AdvancedModePanel';
import { BulkModePanel } from '@/src/features/journal/entry/modes/bulk/BulkModePanel';
import {
  GuidedFooterAmount,
  GuidedModePanel,
  GuidedVoiceActions,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { SplitModePanel } from '@/src/features/journal/entry/modes/split/SplitModePanel';
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
  onBulkSaveSuccess: (count: number, summaries: SavedJournalSummary[]) => void;
  bulkActionsRef: MutableRefObject<{ clearRows: () => void } | null>;
  onGuidedFooterAmountChange: (footer: GuidedFooterAmount | null) => void;
  guidedVoiceActionsRef: MutableRefObject<GuidedVoiceActions | null>;
};

/** Lazy-mounts only the active mode panel so inactive mode *forms* are not running. */
export function JournalEntryModeBody({
  activeMode,
  accounts,
  editor,
  workplaceId,
  workplaceCurrency,
  onSelectAccountRequest,
  onBulkSaveSuccess,
  bulkActionsRef,
  onGuidedFooterAmountChange,
  guidedVoiceActionsRef,
}: JournalEntryModeBodyProps) {
  if (activeMode === 'guided') {
    return (
      <GuidedModePanel
        accounts={accounts}
        editor={editor}
        workplaceId={workplaceId}
        onSelectAccountRequest={onSelectAccountRequest}
        onFooterAmountChange={onGuidedFooterAmountChange}
        voiceActionsRef={guidedVoiceActionsRef}
      />
    );
  }

  if (activeMode === 'split') {
    return (
      <SplitModePanel
        accounts={accounts}
        editor={editor}
        initialAmount={editor.lines.find(line => line.amount)?.amount}
        onSelectAccountRequest={onSelectAccountRequest}
        isEdit={editor.isEdit}
        isSubmitting={editor.isSubmitting}
      />
    );
  }

  if (activeMode === 'advanced') {
    return (
      <AdvancedModePanel
        accounts={accounts}
        editor={editor}
        workplaceCurrency={workplaceCurrency}
        onSelectAccountRequest={onSelectAccountRequest}
      />
    );
  }

  return (
    <BulkModePanel
      workplaceId={workplaceId}
      workplaceCurrency={workplaceCurrency}
      accounts={accounts}
      onSaveSuccess={onBulkSaveSuccess}
      bulkActionsRef={bulkActionsRef}
    />
  );
}
