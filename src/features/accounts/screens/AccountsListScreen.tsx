import { AccountsListHeaderActions } from '@/src/features/accounts/components/AccountsListHeaderActions';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountsListView } from '@/src/features/accounts/components/AccountsListView';
import { useAccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import { useMemo } from 'react';

function AccountsScreen() {
  const vm = useAccountsListViewModel();

  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: 'Accounts',
      showBack: false,
      alignTitle: 'left',
      isSearchActive: vm.isSearching,
      headerActions: (
        <AccountsListHeaderActions
          isSearching={vm.isSearching}
          searchQuery={vm.searchQuery}
          onSearchChange={vm.onSearchChange}
          setIsSearching={vm.setIsSearching}
          onReorderPress={vm.onReorderPress}
          onManageHierarchy={vm.onManageHierarchy}
        />
      ),
      fab: vm.isSearching
        ? undefined
        : {
            onPress: vm.onCreateAccount,
            label: vm.activeTab === 'categories' ? 'New Category' : 'New Account',
            placement: 'end',
            accessibilityLabel:
              vm.activeTab === 'categories' ? 'Create a new category' : 'Create a new account',
          },
    }),
    [
      vm.activeTab,
      vm.isSearching,
      vm.onCreateAccount,
      vm.onManageHierarchy,
      vm.onReorderPress,
      vm.onSearchChange,
      vm.searchQuery,
      vm.setIsSearching,
    ],
  );

  return <AccountsListView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(AccountsScreen);
