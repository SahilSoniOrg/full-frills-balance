import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSplitEntryState } from '@/src/features/journal/entry/hooks/useSplitEntryState';

export type SplitModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  splitDraft: ReturnType<typeof useSplitEntryState>;
  onSelectAccountRequest: (lineId: string) => void;
  isActive?: boolean;
};

export function SplitModePanel({
  accounts,
  editor,
  splitDraft,
  onSelectAccountRequest,
  isActive = true,
}: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    editor,
    splitDraft,
    onSelectAccountRequest,
    isActive,
  });
  return <SplitForm {...splitEditor} />;
}
