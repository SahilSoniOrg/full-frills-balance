import { SplitForm } from '@/src/features/journal/entry/components/SplitForm';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import {
  bindRowAccountCreate,
  type JournalAccountCreateTarget,
} from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import type { CreateAccountIntent } from '@/src/components/account-selection';
import type { AccountFields } from '@/src/types/plainDtos';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import type { PersonPickerGroup } from '@/src/components/account-selection/personAccountGrouping';
import type { PersonId, WorkplaceId } from '@/src/types/ids';
import type { SplitParticipant } from '@/src/features/journal/entry/components/SplitPeopleParticipantsBar';

export type SplitModePanelProps = {
  accounts: AccountFields[];
  workplaceCurrency: string;
  editor: ReturnType<typeof useJournalEditor>;
  onCreateAccountForTarget: (
    target: JournalAccountCreateTarget,
    intent: CreateAccountIntent,
  ) => void;
  people?: SplitParticipant[];
  peopleGroups?: readonly PersonPickerGroup[];
  initialPersonId?: PersonId;
  workplaceId?: WorkplaceId;
  onQuickAddPerson?: (name: string) => Promise<void>;
  onCreatePersonRequest?: () => void;
};

export function SplitModePanel({
  accounts,
  workplaceCurrency,
  editor,
  onCreateAccountForTarget,
  ...peopleProps
}: SplitModePanelProps) {
  const splitEditor = useSplitJournalEditor({
    accounts,
    workplaceCurrency,
    editor,
  });
  return (
    <SplitForm
      {...splitEditor}
      {...peopleProps}
      onCreateAccountRequestForRow={bindRowAccountCreate('splitRow', onCreateAccountForTarget)}
    />
  );
}
