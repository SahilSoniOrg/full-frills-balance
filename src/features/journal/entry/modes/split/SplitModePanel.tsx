import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';

export type SplitModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  onSelectAccountRequest: (lineId: string) => void;
};

export function SplitModePanel({ accounts, editor, onSelectAccountRequest }: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest,
  });
  return <SplitForm {...splitEditor} />;
}
