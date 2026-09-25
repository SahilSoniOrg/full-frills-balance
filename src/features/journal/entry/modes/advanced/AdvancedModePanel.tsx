import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { useAdvancedJournalForm } from '@/src/features/journal/entry/hooks/useAdvancedJournalForm';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import type { AccountRole } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';

export type AdvancedModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceCurrency: string;
  onCreateAccountRequestForRow: (
    rowId: string,
    role: AccountRole,
    intent: CreateAccountIntent,
  ) => void;
  showLineNotes?: boolean;
};

export function AdvancedModePanel({
  accounts,
  editor,
  workplaceCurrency,
  onCreateAccountRequestForRow,
  showLineNotes = false,
}: AdvancedModePanelProps) {
  const form = useAdvancedJournalForm({
    editor,
    accounts,
    workplaceCurrency,
  });

  return (
    <AdvancedForm
      {...form}
      showLineNotes={showLineNotes}
      onCreateAccountRequestForRow={onCreateAccountRequestForRow}
    />
  );
}
