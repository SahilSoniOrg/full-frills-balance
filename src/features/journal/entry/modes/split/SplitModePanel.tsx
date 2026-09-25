import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import {
  bindRowAccountCreate,
  type JournalAccountCreateTarget,
} from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import type { CreateAccountIntent } from '@/src/components/account-selection';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';

export type SplitModePanelProps = {
  accounts: AccountFields[];
  workplaceCurrency: string;
  editor: ReturnType<typeof useJournalEditor>;
  onCreateAccountForTarget: (
    target: JournalAccountCreateTarget,
    intent: CreateAccountIntent,
  ) => void;
};

export function SplitModePanel({
  accounts,
  workplaceCurrency,
  editor,
  onCreateAccountForTarget,
}: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    workplaceCurrency,
    editor,
  });
  return (
    <SplitForm
      {...splitEditor}
      onCreateAccountRequestForRow={bindRowAccountCreate('splitRow', onCreateAccountForTarget)}
    />
  );
}
