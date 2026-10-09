import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountDetailsView } from '@/src/features/accounts/components/AccountDetailsView';
import { accountDetailsCopy } from '@/src/features/accounts/helpers/accountFlowLabels';
import { useAccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { Icon } from '@/src/types/domainIcons';
import { useMemo } from 'react';

function AccountDetailsScreen() {
  const vm = useAccountDetailsViewModel();
  const {
    accountName,
    accountLoading,
    accountMissing,
    accountType,
    headerActions,
    isDeleted,
    onAddPress,
    isSelectionModeActive,
    selectionChrome,
  } = vm;

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = accountLoading ? 'loading' : accountMissing ? 'missing' : 'ready';
    return applySelectionChrome(
      buildDetailNavChrome({
        phase,
        readyTitle: accountName || `${accountDetailsCopy(accountType).entity} Details`,
        loadingTitle: 'Account Details',
        onBack: vm.onBack,
        headerActions: (
          <DetailHeaderMenuActions
            privacyPosition="leading"
            leadingActions={headerActions.leading}
            actions={headerActions.menu}
          />
        ),
        fab: isDeleted
          ? undefined
          : {
              onPress: onAddPress,
              label: 'Add Transaction',
              icon: Icon.Plus,
              placement: 'end',
              accessibilityLabel: 'Add transaction for this account',
            },
      }),
      {
        active: isSelectionModeActive,
        onExit: selectionChrome.exitSelectionMode,
      },
    );
  }, [
    accountName,
    accountLoading,
    accountMissing,
    accountType,
    headerActions,
    isDeleted,
    onAddPress,
    isSelectionModeActive,
    selectionChrome.exitSelectionMode,
    vm.onBack,
  ]);

  return <AccountDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(AccountDetailsScreen);
