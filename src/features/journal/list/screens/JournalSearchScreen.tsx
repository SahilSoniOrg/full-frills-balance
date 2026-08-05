import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { JournalSearchView } from '@/src/features/journal/list/components/JournalSearchView';
import { useJournalSearchViewModel } from '@/src/features/journal/list/hooks/useJournalSearchViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useMemo } from 'react';

function JournalSearchScreen() {
  const vm = useJournalSearchViewModel();

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: 'Search',
      showBack: true,
      backIcon: 'back',
      headerActions: <PrivacyToggleButton />,
    }),
    [],
  );

  return <JournalSearchView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(JournalSearchScreen);
