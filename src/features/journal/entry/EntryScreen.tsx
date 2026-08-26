import { JournalEntryView } from '@/src/features/journal/entry/components/JournalEntryView';
import { useJournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';

function EntryScreen() {
  const vm = useJournalEntryShell();
  return <JournalEntryView {...vm} />;
}

export default EntryScreen;
