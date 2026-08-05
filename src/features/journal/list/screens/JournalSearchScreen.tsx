import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { JournalSearchView } from '@/src/features/journal/list/components/JournalSearchView';
import { useJournalSearchViewModel } from '@/src/features/journal/list/hooks/useJournalSearchViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useMemo } from 'react';

function JournalSearchScreen() {
  const vm = useJournalSearchViewModel();

  const chrome = useMemo<ScreenNavChrome>(
    () =>
      applySelectionChrome(privacyNavChrome('Search'), {
        active: vm.isSelectionModeActive,
        onExit: vm.exitSelectionMode,
      }),
    [vm.exitSelectionMode, vm.isSelectionModeActive],
  );

  return <JournalSearchView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(JournalSearchScreen);
