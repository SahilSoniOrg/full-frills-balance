import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AccountReorderView } from '@/src/features/accounts/components/AccountReorderView';
import { useAccountReorderViewModel } from '@/src/features/accounts/hooks/useAccountReorderViewModel';
import { useMemo } from 'react';

export default function AccountReorderScreen() {
  const vm = useAccountReorderViewModel();
  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: vm.title,
      showBack: true,
      backIcon: 'close',
    }),
    [vm.title],
  );
  return <AccountReorderView {...vm} chrome={chrome} />;
}
