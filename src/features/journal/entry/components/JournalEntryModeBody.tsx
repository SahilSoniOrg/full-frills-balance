import { JournalEntryScreenMode } from '@/src/features/journal/entry/journalEntryPresentation';
import { AdvancedModePanel } from '@/src/features/journal/entry/modes/advanced/AdvancedModePanel';
import { BulkModePanel } from '@/src/features/journal/entry/modes/bulk/BulkModePanel';
import {
  GuidedFooterAmount,
  GuidedModePanel,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { SplitModePanel } from '@/src/features/journal/entry/modes/split/SplitModePanel';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { SavedJournalSummary } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import Account from '@/src/data/models/Account';
import { WorkplaceId } from '@/src/types/domain';
import { MutableRefObject } from 'react';

export type JournalEntryModeBodyProps = {
  activeMode: JournalEntryScreenMode;
  accounts: Account[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  onSelectAccountRequest: (lineId: string) => void;
  onBulkSaveSuccess: (count: number, summaries: SavedJournalSummary[]) => void;
  bulkActionsRef: MutableRefObject<{ clearRows: () => void } | null>;
  splitEditor: SplitJournalController;
  onGuidedFooterAmountChange: (footer: GuidedFooterAmount | null) => void;
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
  splitEditor,
  onGuidedFooterAmountChange,
}: JournalEntryModeBodyProps) {
  if (activeMode === 'guided') {
    return (
      <GuidedModePanel
        accounts={accounts}
        editor={editor}
        onSelectAccountRequest={onSelectAccountRequest}
        onFooterAmountChange={onGuidedFooterAmountChange}
      />
    );
  }

  if (activeMode === 'split') {
    return (
      <SplitModePanel
        splitEditor={splitEditor}
        isEdit={editor.isEdit}
        isSubmitting={editor.isSubmitting}
      />
    );
  }

  if (activeMode === 'advanced') {
    return (
      <AdvancedModePanel
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
