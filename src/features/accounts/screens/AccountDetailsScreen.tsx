import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import { MoneyDetailHeaderActions } from '@/src/components/common/MoneyDetailHeaderActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
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
  const {
    accountLoading,
    accountMissing,
    accountType,
    exitSelectionMode,
    headerActions,
    isDeleted,
    isParent,
    isSelectionModeActive,
    onAddPress,
  } = vm;

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = accountLoading ? 'loading' : accountMissing ? 'missing' : 'ready';
    const titleVm = { isParent, accountType };

    return applySelectionChrome(
      buildDetailNavChrome({
        phase,
        readyTitle: accountDetailsScreenTitle(titleVm),
        loadingTitle: 'Account Details',
        headerActions: (
          <MoneyDetailHeaderActions
            privacyVariant="surface"
            actions={buildAccountDetailsHeaderActions(headerActions, theme)}
          />
        ),
        fab: isDeleted
          ? undefined
          : {
              onPress: onAddPress,
              label: 'Add Transaction',
              icon: 'plusCircle',
              placement: 'end',
              accessibilityLabel: 'Add transaction for this account',
            },
      }),
      {
        active: isSelectionModeActive,
        onExit: exitSelectionMode,
      },
    );
  }, [
    theme,
    accountLoading,
    accountMissing,
    accountType,
    exitSelectionMode,
    headerActions,
    isDeleted,
    isParent,
    isSelectionModeActive,
    onAddPress,
  ]);

  return <AccountDetailsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(AccountDetailsScreen);
