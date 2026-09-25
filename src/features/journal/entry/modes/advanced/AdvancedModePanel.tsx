import type { CreateAccountIntent } from '@/src/components/account-selection';
import { AdvancedForm } from '@/src/features/journal/entry/components/AdvancedForm';
import { useAdvancedJournalForm } from '@/src/features/journal/entry/hooks/useAdvancedJournalForm';
import {
  bindRowAccountCreate,
  type JournalAccountCreateTarget,
} from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import type { AccountFields } from '@/src/types/plainDtos';

export type AdvancedModePanelProps = {
  accounts: AccountFields[];
  editor: ReturnType<typeof useJournalEditor>;
  workplaceCurrency: string;
  onCreateAccountForTarget: (
    target: JournalAccountCreateTarget,
    intent: CreateAccountIntent,
  ) => void;
  showLineNotes?: boolean;
};

export function AdvancedModePanel({
  accounts,
  editor,
  workplaceCurrency,
  onCreateAccountForTarget,
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
      onCreateAccountRequestForRow={bindRowAccountCreate('advancedRow', onCreateAccountForTarget)}
    />
  );
}
