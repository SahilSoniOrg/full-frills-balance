import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { TransactionInboxHeaderActions } from '@/src/features/settings/components/TransactionInboxHeaderActions';
import { TransactionInboxView } from '@/src/features/settings/components/TransactionInboxView';
import { useTransactionInboxViewModel } from '@/src/features/settings/hooks/useTransactionInboxViewModel';
import { useMemo } from 'react';

function TransactionInboxScreen() {
  const vm = useTransactionInboxViewModel();

  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: 'Transaction Inbox',
      showBack: true,
      backIcon: 'back',
      headerActions: (
        <TransactionInboxHeaderActions
          isRefreshing={vm.isRefreshing}
          onRefresh={vm.handleRefresh}
        />
      ),
    }),
    [vm.handleRefresh, vm.isRefreshing],
  );

  return <TransactionInboxView vm={vm} chrome={chrome} />;
}

export default withPrivacyScope(TransactionInboxScreen);
