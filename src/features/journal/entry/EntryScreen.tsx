import { JournalEntryView } from '@/src/features/journal/entry/components/JournalEntryView';
import { useJournalEntryViewModel } from '@/src/features/journal/entry/hooks/useJournalEntryViewModel';
import React from 'react';

export default function EntryScreen() {
  const vm = useJournalEntryViewModel();
  return <JournalEntryView {...vm} />;
}
