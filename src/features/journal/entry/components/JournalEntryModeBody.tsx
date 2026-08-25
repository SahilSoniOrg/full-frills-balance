import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { AdvancedModePanel } from '@/src/features/journal/entry/modes/advanced/AdvancedModePanel';
import { BulkModePanel } from '@/src/features/journal/entry/modes/bulk/BulkModePanel';
import {
  GuidedFooterAmount,
  GuidedModePanel,
  GuidedVoiceActions,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { SplitModePanel } from '@/src/features/journal/entry/modes/split/SplitModePanel';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSplitEntryState } from '@/src/features/journal/entry/hooks/useSplitEntryState';
import { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { ModeHandle } from '@/src/features/journal/entry/modes/ModeHandle';
import type { AccountFields } from '@/src/types/plainDtos';
import { WorkplaceId } from '@/src/types/ids';
import { MutableRefObject } from 'react';
import { View } from 'react-native';

export type JournalEntryModeBodyProps = {
  activeMode: JournalEntryScreenMode;
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  splitDraft: ReturnType<typeof useSplitEntryState>;
  bulkEditor: ReturnType<typeof useBulkJournalEditor>;
  onModeHandleChange: (handle: ModeHandle | null) => void;
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  onSelectAccountRequest: (lineId: string) => void;
  bulkActionsRef: MutableRefObject<{ clearRows: () => void } | null>;
  onGuidedFooterAmountChange: (footer: GuidedFooterAmount | null) => void;
  guidedVoiceActionsRef: MutableRefObject<GuidedVoiceActions | null>;
};

/** Keeps mode drafts mounted while exposing only the active mode to the shell. */
export function JournalEntryModeBody({
  activeMode,
  accounts,
  editor,
  splitDraft,
  bulkEditor,
  onModeHandleChange,
  workplaceId,
  workplaceCurrency,
  onSelectAccountRequest,
  bulkActionsRef,
  onGuidedFooterAmountChange,
  guidedVoiceActionsRef,
}: JournalEntryModeBodyProps) {
  return (
    <View style={styles.container}>
      <View style={activeMode === 'guided' ? styles.active : styles.inactive}>
        <GuidedModePanel
          accounts={accounts}
          editor={editor}
          workplaceId={workplaceId}
          onSelectAccountRequest={onSelectAccountRequest}
          onFooterAmountChange={onGuidedFooterAmountChange}
          voiceActionsRef={guidedVoiceActionsRef}
          isActive={activeMode === 'guided'}
          onModeHandleChange={onModeHandleChange}
        />
      </View>
      <View style={activeMode === 'split' ? styles.active : styles.inactive}>
        <SplitModePanel
          accounts={accounts}
          editor={editor}
          splitDraft={splitDraft}
          onSelectAccountRequest={onSelectAccountRequest}
          isEdit={editor.isEdit}
          isSubmitting={editor.isSubmitting}
          isActive={activeMode === 'split'}
          onModeHandleChange={onModeHandleChange}
        />
      </View>
      <View style={activeMode === 'advanced' ? styles.active : styles.inactive}>
        <AdvancedModePanel
          accounts={accounts}
          editor={editor}
          workplaceCurrency={workplaceCurrency}
          onSelectAccountRequest={onSelectAccountRequest}
          isActive={activeMode === 'advanced'}
          onModeHandleChange={onModeHandleChange}
        />
      </View>
      <View style={activeMode === 'bulk' ? styles.active : styles.inactive}>
        <BulkModePanel
          accounts={accounts}
          bulkEditor={bulkEditor}
          bulkActionsRef={bulkActionsRef}
          isActive={activeMode === 'bulk'}
          onModeHandleChange={onModeHandleChange}
        />
      </View>
    </View>
  );
}

const styles = {
  container: { flex: 1 },
  active: { flex: 1 },
  inactive: { display: 'none' as const },
};
