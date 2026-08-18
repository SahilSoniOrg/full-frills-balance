import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { TransactionInboxHeaderActions } from '@/src/features/settings/components/TransactionInboxHeaderActions';
import { TransactionInboxView } from '@/src/features/settings/components/TransactionInboxView';
import { useTransactionInboxViewModel } from '@/src/features/settings/hooks/useTransactionInboxViewModel';
import { AppNavigation } from '@/src/utils/navigation';

function TransactionInboxScreen() {
  const vm = useTransactionInboxViewModel();

  return (
    <TransactionInboxView
      vm={vm}
      headerActions={
        <TransactionInboxHeaderActions
          isRefreshing={vm.isRefreshing}
          onRefresh={vm.handleRefresh}
          onOpenRules={AppNavigation.toSmsRules}
        />
      }
    />
  );
}

export default withPrivacyScope(TransactionInboxScreen);
