import { useMemo } from 'react';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { usePrimaryLeafActive } from '@/src/navigation/primaryPageNavigation';
import { AccountsListHeaderActions } from '../components/AccountsListHeaderActions';
import { AccountsListView } from '../components/AccountsListView';
import { useAccountsListViewModel } from '../hooks/useAccountsListViewModel';

/** A single retained leaf. The Home V2 shell owns header and sibling controls. */
export function AccountsListScreen({ tab = 'accounts' }: { tab?: 'accounts' | 'categories' }) {
  const active = usePrimaryLeafActive(tab);
  const vm = useAccountsListViewModel(tab, active);
  const chrome = useMemo<TabScreenChrome>(
    () => ({
      kind: 'tab',
      screenTitle: 'Accounts',
      isSearchActive: vm.isSearching,
      selection: vm.selectionChrome,
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
    }),
    [
      vm.isSearching,
      vm.searchQuery,
      vm.onSearchChange,
      vm.setIsSearching,
      vm.onManageHierarchy,
      vm.accountsForArchiveToggle,
      vm.selectionChrome,
    ],
  );
  return (
    <ScreenWithChrome chrome={chrome} scrollable={false} testID={`${tab}-screen`}>
      <AccountsListView {...vm} />
    </ScreenWithChrome>
  );
}

export default AccountsListScreen;
