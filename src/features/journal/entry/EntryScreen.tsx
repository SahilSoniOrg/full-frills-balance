import { JournalEntryView } from '@/src/features/journal/entry/components/JournalEntryView';
import { useJournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';

function EntryScreenContent() {
  const vm = useJournalEntryShell();
  return <JournalEntryView {...vm} />;
}

function EntryScreen() {
  return <EntryScreenContent />;
}

export default EntryScreen;
