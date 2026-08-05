import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { TransactionInboxHeaderActions } from '@/src/features/settings/components/TransactionInboxHeaderActions';
import { TransactionInboxView } from '@/src/features/settings/components/TransactionInboxView';
import { useTransactionInboxViewModel } from '@/src/features/settings/hooks/useTransactionInboxViewModel';

function TransactionInboxScreen() {
  const vm = useTransactionInboxViewModel();

  return (
    <TransactionInboxView
      vm={vm}
      headerActions={
        <TransactionInboxHeaderActions
          isRefreshing={vm.isRefreshing}
          onRefresh={vm.handleRefresh}
        />
      }
    />
  );
}

export default withPrivacyScope(TransactionInboxScreen);
