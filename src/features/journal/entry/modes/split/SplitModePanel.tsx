import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import type { CreateAccountIntent } from '@/src/components/account-selection';
import type { AccountRole } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';

export type SplitModePanelProps = {
  accounts: AccountFields[];
  workplaceCurrency: string;
  editor: ReturnType<typeof useJournalEditor>;
  onCreateAccountRequestForRow: (
    rowId: string,
    role: AccountRole,
    intent: CreateAccountIntent,
  ) => void;
};

export function SplitModePanel({
  accounts,
  workplaceCurrency,
  editor,
  onCreateAccountRequestForRow,
}: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    workplaceCurrency,
    editor,
  });
  return (
    <SplitForm
      {...splitEditor}
      isEditing={editor.isEdit}
      onCreateAccountRequestForRow={onCreateAccountRequestForRow}
    />
  );
}
