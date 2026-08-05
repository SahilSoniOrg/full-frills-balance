import { MoneyDetailHeaderActions } from '@/src/components/common/MoneyDetailHeaderActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { Opacity } from '@/src/constants';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountDetailsView } from '@/src/features/accounts/components/AccountDetailsView';
import {
  accountDetailsScreenTitle,
  buildAccountDetailsHeaderActions,
} from '@/src/features/accounts/helpers/buildAccountDetailsHeaderActions';
import { useAccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo } from 'react';

function AccountDetailsScreen() {
  const vm = useAccountDetailsViewModel();
  const { theme } = useTheme();

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = vm.accountLoading ? 'loading' : vm.accountMissing ? 'missing' : 'ready';
    const selectionActive = vm.isSelectionModeActive;

    return {
      ...buildDetailNavChrome({
        phase,
        readyTitle: accountDetailsScreenTitle(vm),
        loadingTitle: 'Account Details',
        headerActions: (
          <MoneyDetailHeaderActions
            privacyVariant="surface"
            actions={buildAccountDetailsHeaderActions(vm, theme)}
          />
        ),
        fab:
          vm.isDeleted || selectionActive
            ? undefined
            : {
                onPress: vm.onAddPress,
                label: 'Add Transaction',
                icon: 'plusCircle',
                placement: 'end',
                accessibilityLabel: 'Add transaction for this account',
              },
      }),
      headerStyle: selectionActive ? { opacity: Opacity.medium } : undefined,
      onBack: selectionActive ? vm.exitSelectionMode : vm.onBack,
    };
  }, [
    theme,
    vm.accountLoading,
    vm.accountMissing,
    vm.accountType,
    vm.exitSelectionMode,
    vm.headerActions,
    vm.isDeleted,
    vm.isParent,
    vm.isSelectionModeActive,
    vm.onAddPress,
    vm.onAuditPress,
    vm.onBack,
    vm.reconciledAt,
    vm.unreconciledCount,
  ]);

  return <AccountDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(AccountDetailsScreen);
