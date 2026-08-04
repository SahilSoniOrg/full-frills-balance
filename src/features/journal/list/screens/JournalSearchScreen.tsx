import { JournalSearchView } from '@/src/features/journal/list/components/JournalSearchView';
import { useJournalSearchViewModel } from '@/src/features/journal/list/hooks/useJournalSearchViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';

function JournalSearchScreen() {
  const vm = useJournalSearchViewModel();
  return <JournalSearchView {...vm} />;
}

export default withPrivacyScope(JournalSearchScreen);
