import { AccountsListHeaderActions } from '@/src/features/accounts/components/AccountsListHeaderActions';
import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { usePrimaryPageNavigation } from '@/src/navigation/primaryPageNavigation';
import { AccountsListView } from '@/src/features/accounts/components/AccountsListView';
import { useAccountsListViewModel } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import { useMemo } from 'react';

export function AccountsListScreen({
  activeTab = 'accounts',
}: {
  activeTab?: 'accounts' | 'categories';
}) {
  const vm = useAccountsListViewModel(activeTab);
  const pageNavigation = usePrimaryPageNavigation();

  const chrome = useMemo<TabScreenChrome>(() => {
    const baseChrome: TabScreenChrome = {
      screenTitle: 'Accounts',
      kind: 'tab',
      isSearchActive: vm.isSearching,
      headerActions: (
        <AccountsListHeaderActions
          isSearching={vm.isSearching}
          searchQuery={vm.searchQuery}
          onSearchChange={vm.onSearchChange}
          setIsSearching={vm.setIsSearching}
          onManageHierarchy={vm.onManageHierarchy}
          accountsForArchiveToggle={vm.accountsForArchiveToggle}
        />
      ),
    };

    return applySelectionChrome(baseChrome, {
      active: vm.isSelectionModeActive,
      onExit: vm.selectionChrome.exitSelectionMode,
    });
  }, [
    vm.accountsForArchiveToggle,
    vm.isSearching,
    vm.isSelectionModeActive,
    vm.selectionChrome.exitSelectionMode,
    vm.onManageHierarchy,
    vm.onSearchChange,
    vm.searchQuery,
    vm.setIsSearching,
  ]);

  return <AccountsListView {...vm} chrome={chrome} pageProgress={pageNavigation?.pageProgress} />;
}

export default AccountsListScreen;
