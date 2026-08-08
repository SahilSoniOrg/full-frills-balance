import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { withArchiveVisibilityScope } from '@/src/contexts/ArchiveVisibilityScope';
import { AccountReorderView } from '@/src/features/accounts/components/AccountReorderView';
import { ShowArchivedButton } from '@/src/features/accounts/components/ShowArchivedButton';
import { useAccountReorderViewModel } from '@/src/features/accounts/hooks/useAccountReorderViewModel';
import { useMemo } from 'react';

function AccountReorderScreen() {
  const vm = useAccountReorderViewModel();
  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: vm.title,
      showBack: true,
      backIcon: 'close',
      headerActions: <ShowArchivedButton accounts={vm.accountsForArchiveToggle} />,
    }),
    [vm.accountsForArchiveToggle, vm.title],
  );
  return <AccountReorderView {...vm} chrome={chrome} />;
}

export default withArchiveVisibilityScope(AccountReorderScreen);
