import { useMemo } from 'react';
import { ScreenWithChrome } from '@/src/components/layout';
import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
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
    () =>
      applySelectionChrome(
        {
          kind: 'tab',
          screenTitle: 'Accounts',
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
        },
        { active: vm.isSelectionModeActive, onExit: vm.selectionChrome.exitSelectionMode },
      ),
    [
      vm.isSearching,
      vm.searchQuery,
      vm.onSearchChange,
      vm.setIsSearching,
      vm.onManageHierarchy,
      vm.accountsForArchiveToggle,
      vm.isSelectionModeActive,
      vm.selectionChrome.exitSelectionMode,
    ],
  );
  return (
    <ScreenWithChrome chrome={chrome} scrollable={false} testID={`${tab}-screen`}>
      <AccountsListView {...vm} />
    </ScreenWithChrome>
  );
}

export default AccountsListScreen;
