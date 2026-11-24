import { useMemo } from 'react';
import { ScreenWithChrome } from '@/src/components/layout';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { getSelectionState } from '@/src/hooks/selectionState';
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
      selection: vm.isSelectionModeActive
        ? {
            ...vm.selectionChrome,
            state: getSelectionState(vm.selectedAccountIds, vm.selectableAccountIds),
            itemTypeLabel:
              tab === 'categories'
                ? AppConfig.strings.selection.itemTypes.category
                : AppConfig.strings.selection.itemTypes.account,
          }
        : undefined,
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
      vm.isSelectionModeActive,
      vm.selectedAccountIds,
      vm.selectableAccountIds,
      vm.selectionChrome,
      tab,
    ],
  );
  return (
    <ScreenWithChrome chrome={chrome} scrollable={false} testID={`${tab}-screen`}>
      <AccountsListView {...vm} />
    </ScreenWithChrome>
  );
}

export default AccountsListScreen;
