import { JournalEntryView } from '@/src/features/journal/entry/components/JournalEntryView';
import { useJournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import { ModeHandleProvider } from '@/src/features/journal/entry/modes/ModeHandleContext';

function EntryScreenContent() {
  const vm = useJournalEntryViewModel();
  return <JournalEntryView {...vm} />;
}

export default function EntryScreen() {
  return (
    <ModeHandleProvider>
      <EntryScreenContent />
    </ModeHandleProvider>
  );
}
