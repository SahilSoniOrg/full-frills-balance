import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { withArchiveVisibilityScope } from '@/src/contexts/ArchiveVisibilityScope';
import { AppConfig } from '@/src/constants/app-config';
import { ManageHierarchyView } from '@/src/features/accounts/components/ManageHierarchyView';
import { ShowArchivedButton } from '@/src/features/accounts/components/ShowArchivedButton';
import { useManageHierarchyViewModel } from '@/src/features/accounts/hooks/useManageHierarchyViewModel';
import { useMemo } from 'react';

function ManageHierarchyScreen() {
  const vm = useManageHierarchyViewModel();
  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: AppConfig.strings.accounts.hierarchy.title,
      showBack: true,
      backIcon: 'back',
      headerActions: <ShowArchivedButton accounts={vm.accountsForArchiveToggle} />,
    }),
    [vm.accountsForArchiveToggle],
  );
  return <ManageHierarchyView {...vm} chrome={chrome} />;
}

export default withArchiveVisibilityScope(ManageHierarchyScreen);
