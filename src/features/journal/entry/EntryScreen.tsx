import { JournalEntryView } from '@/src/features/journal/entry/components/JournalEntryView';
import { useJournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { ModeHandleProvider } from '@/src/features/journal/entry/modes/ModeHandleContext';

function EntryScreenContent() {
  const vm = useJournalEntryShell();
  return <JournalEntryView {...vm} />;
}

function EntryScreen() {
  return (
    <ModeHandleProvider>
      <EntryScreenContent />
    </ModeHandleProvider>
  );
}

export default EntryScreen;
