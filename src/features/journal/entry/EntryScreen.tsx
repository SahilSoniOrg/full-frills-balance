import { JournalEntryView } from '@/src/features/journal/entry/components/JournalEntryView';
import { useJournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { Redirect, useLocalSearchParams } from 'expo-router';

function EntryScreenContent() {
  const params = useLocalSearchParams<{ mode?: string }>();
  if (params.mode === 'bulk') {
    return <Redirect href="/journal-bulk" />;
  }

  return <JournalEntryComposer />;
}

function JournalEntryComposer() {
  const vm = useJournalEntryShell();
  return <JournalEntryView {...vm} />;
}

function EntryScreen() {
  return <EntryScreenContent />;
}

export default EntryScreen;
