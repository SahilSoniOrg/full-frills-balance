import { privacyNavChrome } from '@/src/components/layout/privacyNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { journalCsvExportHeaderAction } from '@/src/components/journal/JournalCsvExportButton';
import { transactionCaptureStrings as captureCopy } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { JournalSearchView } from '@/src/features/journal/list/components/JournalSearchView';
import { useJournalSearchViewModel } from '@/src/features/journal/list/hooks/useJournalSearchViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AppNavigation } from '@/src/navigation/AppNavigation';

function JournalSearchScreen() {
  const vm = useJournalSearchViewModel();

  const exportAction = journalCsvExportHeaderAction(vm.csvExport);
  const chrome: ScreenNavChrome = {
    ...privacyNavChrome(
      vm.attachMode ? captureCopy.attachToJournalTitle : 'Search',
      AppNavigation.back,
      { actions: exportAction ? [exportAction] : [] },
    ),
    selection: vm.selection.chrome,
  };

  return <JournalSearchView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(JournalSearchScreen);
