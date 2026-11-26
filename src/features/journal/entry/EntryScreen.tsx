import { withArchiveVisibilityScope } from '@/src/contexts/ArchiveVisibilityScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { JournalEntryView } from '@/src/features/journal/entry/components/JournalEntryView';
import { useJournalEntryShell } from '@/src/features/journal/entry/hooks/useJournalEntryShell';
import { useLocalSearchParams } from 'expo-router';

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function EntryScreenContent() {
  const vm = useJournalEntryShell();
  return <JournalEntryView {...vm} />;
}

function EntryScreen() {
  const params = useLocalSearchParams();
  const { workplaceId } = useWorkplace();
  const entryKey = [
    workplaceId,
    readParam(params.journalId) ?? '',
    readParam(params.copyFromJournalId) ?? '',
    readParam(params.smsRecordId) ?? '',
    readParam(params.smsId) ?? '',
    readParam(params.launchSource) ?? '',
  ].join(':');
  return <EntryScreenContent key={entryKey} />;
}

export default withArchiveVisibilityScope(EntryScreen);
