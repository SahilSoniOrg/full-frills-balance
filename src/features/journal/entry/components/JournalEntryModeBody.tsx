import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { AdvancedModePanel } from '@/src/features/journal/entry/modes/advanced/AdvancedModePanel';
import {
  GuidedFooterAmount,
  GuidedModePanel,
  GuidedVoiceActions,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { SplitModePanel } from '@/src/features/journal/entry/modes/split/SplitModePanel';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSplitEntryState } from '@/src/features/journal/entry/hooks/useSplitEntryState';
import type { ComposerSubmitState } from '@/src/features/journal/entry/composerSubmitState';
import type { AccountFields } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { MutableRefObject } from 'react';

export type JournalEntryModeBodyProps = {
  activeMode: JournalEntryScreenMode;
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  splitDraft: ReturnType<typeof useSplitEntryState>;
  onSubmitStateChange: (state: ComposerSubmitState | null) => void;
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  onSelectAccountRequest: (lineId: string) => void;
  onGuidedFooterAmountChange: (footer: GuidedFooterAmount | null) => void;
  guidedVoiceActionsRef: MutableRefObject<GuidedVoiceActions | null>;
};

/** Mounts only the active view; durable drafts live in the shell. */
export function JournalEntryModeBody({
  activeMode,
  accounts,
  editor,
  splitDraft,
  onSubmitStateChange,
  workplaceId,
  workplaceCurrency,
  onSelectAccountRequest,
  onGuidedFooterAmountChange,
  guidedVoiceActionsRef,
}: JournalEntryModeBodyProps) {
  if (activeMode === 'allocation') {
    return (
      <SplitModePanel
        accounts={accounts}
        editor={editor}
        splitDraft={splitDraft}
        onSelectAccountRequest={onSelectAccountRequest}
        isEdit={editor.isEdit}
        isSubmitting={editor.isSubmitting}
        isActive
        onSubmitStateChange={onSubmitStateChange}
      />
    );
  }

  if (activeMode === 'expert') {
    return (
      <AdvancedModePanel
        editor={editor}
        workplaceCurrency={workplaceCurrency}
        onSelectAccountRequest={onSelectAccountRequest}
        isActive
        onSubmitStateChange={onSubmitStateChange}
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
      onSubmitStateChange={onSubmitStateChange}
    />
  );
}
