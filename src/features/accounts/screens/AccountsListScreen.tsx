import { AccountsListHeaderActions } from '@/src/features/accounts/components/AccountsListHeaderActions';
import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { withArchiveVisibilityScope } from '@/src/contexts/ArchiveVisibilityScope';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountsListView } from '@/src/features/accounts/components/AccountsListView';
import { useAccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import { useMemo } from 'react';

function AccountsScreen() {
  const vm = useAccountsListViewModel();

  const fab = useMemo(
    () =>
      vm.isSearching
        ? undefined
        : {
            onPress: vm.onCreateAccount,
            label: vm.activeTab === 'categories' ? 'New Category' : 'New Account',
            placement: 'end' as const,
            accessibilityLabel:
              vm.activeTab === 'categories' ? 'Create a new category' : 'Create a new account',
          },
    [vm.activeTab, vm.isSearching, vm.onCreateAccount],
  );

  const chrome = useMemo<TabScreenChrome>(() => {
    const baseChrome: TabScreenChrome = {
      screenTitle: 'Accounts',
      showBack: false,
      isSearchActive: vm.isSearching,
      headerActions: (
        <AccountsListHeaderActions
          isSearching={vm.isSearching}
          searchQuery={vm.searchQuery}
          onSearchChange={vm.onSearchChange}
          setIsSearching={vm.setIsSearching}
          onReorderPress={vm.onReorderPress}
          onManageHierarchy={vm.onManageHierarchy}
          accountsForArchiveToggle={vm.accountsForArchiveToggle}
        />
      ),
    };

    return applySelectionChrome(baseChrome, {
      active: vm.isSelectionModeActive,
      onExit: vm.selectionChrome.exitSelectionMode,
      fab,
    });
  }, [
    fab,
    vm.accountsForArchiveToggle,
    vm.isSearching,
    vm.isSelectionModeActive,
    vm.selectionChrome.exitSelectionMode,
    vm.onManageHierarchy,
    vm.onReorderPress,
    vm.onSearchChange,
    vm.searchQuery,
    vm.setIsSearching,
  ]);

  return <AccountsListView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(withArchiveVisibilityScope(AccountsScreen));
